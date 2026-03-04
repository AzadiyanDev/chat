import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Chat, Message, User, Reaction, Attachment, ForwardedFromInfo } from '../../models/chat.model';
import { VoiceStorageService } from './voice-storage.service';
import { AudioService } from './audio.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SignalRService } from './signalr.service';
import { E2eeMessageService } from './e2ee-message.service';

const STATUS_MAP: Record<number, Message['status']> = { 0: 'sending', 1: 'sent', 2: 'delivered', 3: 'seen' };
const TYPE_MAP: Record<number, Chat['type']> = { 0: 'direct', 1: 'group', 2: 'channel', 3: 'saved' };
const STATUS_STRING_MAP: Record<string, Message['status']> = {
  sending: 'sending',
  sent: 'sent',
  delivered: 'delivered',
  seen: 'seen'
};
const TYPE_STRING_MAP: Record<string, Chat['type']> = {
  direct: 'direct',
  group: 'group',
  channel: 'channel',
  saved: 'saved',
  savedmessages: 'saved',
  saved_messages: 'saved'
};
const ATTACHMENT_TYPE_MAP: Record<number, Attachment['type']> = {
  0: 'image',
  1: 'video',
  2: 'audio',
  3: 'document'
};
const ATTACHMENT_TYPE_STRING_MAP: Record<string, Attachment['type']> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document'
};
const ATTACHMENT_TYPE_TO_API: Record<Attachment['type'], 'Image' | 'Video' | 'Audio' | 'Document'> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document'
};

@Injectable({ providedIn: 'root' })
export class ChatService {
  private voiceStorage = inject(VoiceStorageService);
  private audio = inject(AudioService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private hub = inject(SignalRService);
  private e2ee = inject(E2eeMessageService);

  /** Same signal interface — delegates to AuthService */
  currentUser = computed<User>(() => {
    const u = this.auth.currentUser();
    return u ?? { id: '', name: '', isOnline: false };
  });

  chats = signal<Chat[]>([]);
  messages = signal<Message[]>([]);
  typingUsers = signal<Map<string, string[]>>(new Map());

  /** Cache for getUserById look-ups */
  private usersCache = new Map<string, User>();
  private loadedChatMessages = new Set<string>();
  private loadingIncomingChats = new Set<string>();
  private tempToPersistedMessageIds = new Map<string, string>();
  /** Cache for getMessagesForChat computed signals — avoids creating a new computed per call */
  private messagesForChatCache = new Map<string, ReturnType<typeof computed<Message[]>>>();
  private initialized = false;

  constructor() {
    this.setupSignalRHandlers();
    this.setupE2eeReceive();

    // Auto-initialize when auth session resolves
    effect(() => {
      const user = this.auth.currentUser();
      if (user && !this.initialized) {
        this.initialized = true;
        this.loadChats();
      } else if (!user) {
        this.initialized = false;
        this.chats.set([]);
        this.messages.set([]);
        this.usersCache.clear();
        this.loadedChatMessages.clear();
        this.loadingIncomingChats.clear();
        this.tempToPersistedMessageIds.clear();
        this.messagesForChatCache.clear();
      }
    });
  }

  // ═══════════════════════════════════════════
  //  SignalR real-time handlers
  // ═══════════════════════════════════════════

  private setupSignalRHandlers() {
    this.hub.onMessage((raw: any) => {
      const message = this.mapMessage(raw);
      // Skip our own messages (already added optimistically)
      if (this.sameId(message.senderId, this.currentUser().id)) return;

      const chatExists = this.chats().some(c => this.sameId(c.id, message.chatId));

      this.messages.update(msgs => this.upsertMessages(msgs, [message]));
      if (chatExists) {
        this.applyIncomingMessageToExistingChat(message);
      } else {
        this.loadIncomingChat(message);
      }

      this.audio.playReceiveSound();
    });

    this.hub.onMessageDeleted((messageId: string) => {
      this.updateMessage(messageId, { isDeleted: true });
    });

    this.hub.onReactionUpdated((data: any) => {
      const messageId = String(data?.messageId ?? data?.id ?? '');
      if (!messageId) return;

      // Preferred payload: full grouped reactions
      if (Array.isArray(data?.reactions)) {
        const reactions = (data.reactions as any[]).map(r => ({
          emoji: String(r?.emoji ?? ''),
          userIds: (r?.userIds || []).map((id: any) => String(id))
        })).filter(r => r.emoji.length > 0);
        this.updateMessage(messageId, { reactions });
        return;
      }

      // Fallback payload: delta reaction update
      const emoji = String(data?.emoji ?? '').trim();
      const userId = String(data?.userId ?? '').trim();
      const action = String(data?.action ?? '').trim().toLowerCase();
      if (!emoji || !userId) return;

      this.messages.update(msgs => msgs.map(m => {
        if (!this.sameId(m.id, messageId)) return m;

        const reactions = [...(m.reactions || [])];
        const existing = reactions.find(r => r.emoji === emoji);

        if (action === 'remove') {
          if (!existing) return m;
          existing.userIds = existing.userIds.filter(id => !this.sameId(id, userId));
          return {
            ...m,
            reactions: reactions.filter(r => r.emoji !== emoji || r.userIds.length > 0)
          };
        }

        if (existing) {
          if (!existing.userIds.some(id => this.sameId(id, userId))) {
            existing.userIds = [...existing.userIds, userId];
          }
          return { ...m, reactions: [...reactions] };
        }

        return { ...m, reactions: [...reactions, { emoji, userIds: [userId] }] };
      }));
    });

    this.hub.onUserTyping((chatId, userId) => this.setTyping(chatId, userId, true));
    this.hub.onUserStoppedTyping((chatId, userId) => this.setTyping(chatId, userId, false));

    this.hub.onUserOnline((userId) => this.updateUserOnlineStatus(userId, true));
    this.hub.onUserOffline((userId) => this.updateUserOnlineStatus(userId, false));

    this.hub.onMessageStatusChanged((messageId, status) => {
      this.updateMessage(messageId, { status: this.normalizeMessageStatus(status) });
    });
  }

  // ═══════════════════════════════════════════
  //  E2EE decrypted message receive pipeline
  // ═══════════════════════════════════════════

  private setupE2eeReceive() {
    this.e2ee.onDecryptedMessages = (plaintexts) => {
      for (const pt of plaintexts) {
        // Skip own messages (already added optimistically)
        if (this.sameId(pt.senderId, this.currentUser().id)) continue;

        // Skip non-message payloads (reactions, receipts)
        if (pt.reaction || pt.receipt) continue;

        const message: Message = {
          id: 'e2ee_' + Math.random().toString(36).substring(2, 9),
          chatId: pt.chatId,
          senderId: pt.senderId,
          text: pt.body,
          timestamp: pt.timestamp || Date.now(),
          status: 'delivered',
          replyToId: pt.replyToId,
          forwardedFrom: pt.forwardedFrom ? {
            userId: pt.forwardedFrom.userId,
            displayName: pt.forwardedFrom.displayName
          } : undefined
        };

        const chatExists = this.chats().some(c => this.sameId(c.id, message.chatId));
        this.messages.update(msgs => this.upsertMessages(msgs, [message]));

        if (chatExists) {
          this.applyIncomingMessageToExistingChat(message);
        } else {
          this.loadIncomingChat(message);
        }

        this.audio.playReceiveSound();
      }
    };
  }

  // ═══════════════════════════════════════════
  //  Initial data loading
  // ═══════════════════════════════════════════

  private async loadChats() {
    try {
      const raw = await this.api.getChats().toPromise();
      if (!raw) return;
      let chats = this.keepSingleSavedChat(this.dedupeChatsById(raw.map((c: any) => this.mapChat(c))));

      // Ensure Saved Messages chat exists and is at the top
      let hasSaved = chats.some(c => c.type === 'saved');
      if (!hasSaved) {
        try {
          const savedRaw = await this.api.getSavedMessagesChat().toPromise();
          if (savedRaw) {
            const savedChat = this.mapChat(savedRaw);
            chats = this.keepSingleSavedChat(this.dedupeChatsById([savedChat, ...chats]), savedChat.id);
            hasSaved = true;
          }
        } catch { /* ignore — server might not support it yet */ }
      }

      // Sort: saved first, then pinned, then by last message time
      this.chats.set(this.sortChats(chats));

      // Cache every participant for getUserById
      for (const chat of chats) {
        for (const p of chat.participants) this.usersCache.set(p.id, p);
      }

      // Join SignalR groups
      for (const chat of chats) {
        this.hub.joinChat(chat.id).catch(() => {});
      }

      // Pre-load messages for every chat (matches original mock behaviour)
      await Promise.all(chats.map(c => this.ensureMessagesLoaded(c.id)));
    } catch (err) {
      console.error('Failed to load chats:', err);
    }
  }

  private async ensureMessagesLoaded(chatId: string) {
    if (this.loadedChatMessages.has(chatId)) return;
    this.loadedChatMessages.add(chatId);
    try {
      const raw = await this.api.getMessages(chatId).toPromise();
      if (!raw) return;
      const incoming = raw.map((m: any) => this.mapMessage(m));
      this.messages.update(msgs => {
        const sameChat = msgs.filter(m => this.sameId(m.chatId, chatId));
        const otherChats = msgs.filter(m => !this.sameId(m.chatId, chatId));
        return [...otherChats, ...this.upsertMessages(sameChat, incoming)];
      });
      this.restoreVoiceUrls(chatId);
    } catch (err) {
      console.error('Failed to load messages for', chatId, err);
      this.loadedChatMessages.delete(chatId);
    }
  }

  // ═══════════════════════════════════════════
  //  API → frontend model mappers
  // ═══════════════════════════════════════════

  private mapChat(d: any): Chat {
    return {
      id: String(d.id),
      type: this.normalizeChatType(d.type),
      participants: (d.participants || [])
        .filter((p: any) => p != null)
        .map((p: any) => this.mapUser(p)),
      lastMessage: d.lastMessage ? this.mapMessage(d.lastMessage) : undefined,
      unreadCount: d.unreadCount ?? 0,
      isPinned: d.isPinned ?? false,
      isArchived: d.isArchived ?? false,
      name: d.name,
      avatarUrl: d.avatarUrl,
      description: d.description,
      memberCount: d.memberCount
    };
  }

  private mapMessage(d: any): Message {
    return {
      id: String(d.id),
      chatId: String(d.chatId),
      senderId: String(d.senderId),
      text: d.text,
      timestamp: d.timestamp ? new Date(d.timestamp).getTime() : Date.now(),
      status: this.normalizeMessageStatus(d.status),
      attachments: (d.attachments || []).map((a: any) => ({
        id: String(a.id ?? ''),
        type: this.normalizeAttachmentType(a.type),
        url: String(a.url ?? ''),
        name: a.name ?? undefined,
        size: typeof a.size === 'number' ? a.size : undefined,
        thumbnailUrl: a.thumbnailUrl ?? undefined
      })),
      voice: d.voice ? {
        url: d.voice.url || '',
        duration: d.voice.duration || 0,
        durationMs: d.voice.durationMs || 0,
        waveform: d.voice.waveform || [],
        storageKey: d.voice.storageKey
      } : undefined,
      replyToId: d.replyToId ? String(d.replyToId) : undefined,
      forwardedFrom: d.forwardedFrom ? {
        userId: String(d.forwardedFrom.userId ?? ''),
        displayName: String(d.forwardedFrom.displayName ?? '')
      } : undefined,
      isDeleted: d.isDeleted ?? false,
      reactions: (d.reactions || []).map((r: any) => ({
        emoji: r.emoji,
        userIds: (r.userIds || []).map((id: any) => String(id))
      }))
    };
  }

  private mapUser(d: any): User {
    return {
      id: String(d.id),
      name: d.name || d.displayName || '',
      username: d.username,
      bio: d.bio,
      avatarUrl: d.avatarUrl,
      isOnline: d.isOnline ?? false,
      lastSeen: d.lastSeen ? new Date(d.lastSeen).getTime() : undefined
    };
  }

  // ═══════════════════════════════════════════
  //  Public API — identical signatures
  // ═══════════════════════════════════════════

  getChatById(chatId: string): Chat | undefined {
    return this.chats().find(c => this.sameId(c.id, chatId));
  }

  getMessagesForChat(chatId: string) {
    // Trigger lazy load if not yet loaded
    this.ensureMessagesLoaded(chatId);
    // Return cached computed signal to avoid creating a new one each call
    let cached = this.messagesForChatCache.get(chatId);
    if (!cached) {
      cached = computed(() =>
        this.messages()
          .filter(m => this.sameId(m.chatId, chatId) && !m.isDeleted)
          .sort((a, b) => a.timestamp - b.timestamp)
      );
      this.messagesForChatCache.set(chatId, cached);
    }
    return cached;
  }

  /** O(1) message lookup by ID — avoids linear scan in template per-item calls */
  messagesByIdMap = computed(() => {
    const map = new Map<string, Message>();
    for (const m of this.messages()) {
      map.set(m.id, m);
    }
    return map;
  });

  getMessageById(messageId: string): Message | undefined {
    return this.messagesByIdMap().get(messageId);
  }

  getParticipant(chat: Chat): User | undefined {
    if (chat.type === 'group' || chat.type === 'channel' || chat.type === 'saved') return undefined;
    return chat.participants.find(p => !this.sameId(p.id, this.currentUser().id));
  }

  addMessage(message: Message) {
    // Optimistic local add
    this.messages.update(msgs => this.upsertMessages(msgs, [message]));

    // Re-order chats (pinned stay on top)
    this.chats.update(chats => {
      const chatIndex = chats.findIndex(c => this.sameId(c.id, message.chatId));
      if (chatIndex === -1) return chats;
      const updatedChat = { ...chats[chatIndex], lastMessage: message, unreadCount: 0 };
      const newChats = [...chats];
      newChats.splice(chatIndex, 1);
      // Saved Messages always first, then pinned, then the rest
      let insertIndex: number;
      if (updatedChat.type === 'saved') {
        insertIndex = 0;
      } else if (updatedChat.isPinned) {
        // After saved chat (if present)
        insertIndex = newChats.findIndex(c => c.type !== 'saved');
        if (insertIndex === -1) insertIndex = 0;
      } else {
        // After all pinned chats
        insertIndex = newChats.filter(c => c.isPinned || c.type === 'saved').length;
      }
      newChats.splice(insertIndex, 0, updatedChat);
      return newChats;
    });

    // Fire-and-forget API send for own messages
    // Skip for voice messages — the component handles upload + send separately
    if (this.sameId(message.senderId, this.currentUser().id) && !message.voice) {
      this.api.sendMessage(message.chatId, {
        text: message.text,
        replyToId: message.replyToId,
        attachments: message.attachments?.map(att => this.mapAttachmentForApi(att))
      }).subscribe({
        next: (raw: any) => {
          if (!raw) return;
          const persisted = this.mapMessage(raw);

          this.messages.update(msgs => {
            let replaced = false;
            let persistedWithLocalState: Message = persisted;

            const nextMsgs = msgs.map(m => {
              if (!this.sameId(m.id, message.id)) return m;
              replaced = true;
              persistedWithLocalState = {
                ...persisted,
                // Keep the local animation state to prevent temporary double-render.
                isAnimating: m.isAnimating,
                status: m.status === 'sending' ? 'sending' : persisted.status
              };
              return persistedWithLocalState;
            });

            if (!this.sameId(message.id, persisted.id)) {
              this.tempToPersistedMessageIds.set(this.normalizeId(message.id), persisted.id);
            }

            if (replaced) {
              return this.upsertMessages(nextMsgs, [persistedWithLocalState]);
            }

            return this.upsertMessages(nextMsgs, [persisted]);
          });

          this.chats.update(chats => chats.map(c =>
            this.sameId(c.id, persisted.chatId)
              ? { ...c, lastMessage: persisted, unreadCount: 0 }
              : c
          ));
        },
        error: (err: any) => console.error('Failed to send message:', err)
      });
    }
  }

  updateMessage(id: string, updates: Partial<Message>) {
    const normalizedId = this.normalizeId(id);
    const mappedId = this.tempToPersistedMessageIds.get(normalizedId);
    const targetId = mappedId ?? id;
    let updated = false;

    this.messages.update(msgs => msgs.map(m => {
      if (!this.sameId(m.id, targetId)) return m;
      updated = true;
      return { ...m, ...updates };
    }));

    if (updated && mappedId && updates.status === 'seen') {
      this.tempToPersistedMessageIds.delete(normalizedId);
    }
  }

  deleteMessage(messageId: string): boolean {
    const msg = this.getMessageById(messageId);
    if (!msg) return false;
    this.updateMessage(messageId, { isDeleted: true });
    this.api.deleteMessage(msg.chatId, messageId).subscribe({
      error: (err: any) => console.error('Failed to delete message:', err)
    });
    return true;
  }

  addReaction(messageId: string, emoji: string) {
    const msg = this.getMessageById(messageId);
    if (!msg) return;
    const userId = this.currentUser().id;

    // Optimistic update (same toggle logic as before)
    this.messages.update(msgs => msgs.map(m => {
      if (m.id !== messageId) return m;
      const reactions = [...(m.reactions || [])];
      const existing = reactions.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.userIds.includes(userId)) {
          existing.userIds = existing.userIds.filter(id => id !== userId);
          if (existing.userIds.length === 0) {
            return { ...m, reactions: reactions.filter(r => r.emoji !== emoji) };
          }
        } else {
          existing.userIds = [...existing.userIds, userId];
        }
        return { ...m, reactions: [...reactions] };
      }
      return { ...m, reactions: [...reactions, { emoji, userIds: [userId] }] };
    }));
    this.audio.playReactionSound();

    this.api.addReaction(msg.chatId, messageId, emoji).subscribe({
      error: (err: any) => console.error('Failed to add reaction:', err)
    });
  }

  markAsRead(chatId: string) {
    this.chats.update(chats => chats.map(c => this.sameId(c.id, chatId) ? { ...c, unreadCount: 0 } : c));
  }

  updateCurrentUserProfile(updates: Partial<Pick<User, 'name' | 'username' | 'bio' | 'avatarUrl'>>) {
    const current = this.currentUser();
    this.auth.updateProfile({
      name: (updates.name ?? current.name).trim() || current.name,
      username: (updates.username ?? current.username ?? '').trim() || current.username || 'my_account',
      bio: (updates.bio ?? current.bio ?? '').trim(),
      avatarUrl: updates.avatarUrl
    });
  }

  private applyIncomingMessageToExistingChat(message: Message) {
    this.chats.update(chats => {
      const updated = chats.map(c =>
        this.sameId(c.id, message.chatId)
          ? { ...c, lastMessage: message, unreadCount: c.unreadCount + 1 }
          : c
      );
      return this.sortChats(updated);
    });
  }

  private loadIncomingChat(message: Message) {
    const key = this.normalizeId(message.chatId);
    if (!key || this.loadingIncomingChats.has(key)) return;

    this.loadingIncomingChats.add(key);

    this.api.getChat(message.chatId).subscribe({
      next: (raw: any) => {
        if (!raw) return;

        const incomingChat = this.mapChat(raw);
        const chatWithMessage: Chat = {
          ...incomingChat,
          lastMessage: message,
          unreadCount: Math.max(incomingChat.unreadCount ?? 0, 1)
        };

        for (const p of chatWithMessage.participants) {
          this.usersCache.set(p.id, p);
        }

        this.chats.update(chats => {
          const merged = this.dedupeChatsById([chatWithMessage, ...chats]);
          return this.sortChats(merged);
        });

        this.hub.joinChat(chatWithMessage.id).catch(() => {});
        this.ensureMessagesLoaded(chatWithMessage.id);
      },
      error: (err: any) => {
        console.error('Failed to load incoming chat:', err);
        this.loadingIncomingChats.delete(key);
      },
      complete: () => {
        this.loadingIncomingChats.delete(key);
      }
    });
  }

  // ═══════════════════════════════════════════
  //  Typing helpers
  // ═══════════════════════════════════════════

  private setTyping(chatId: string, userId: string, isTyping: boolean) {
    this.typingUsers.update(map => {
      const newMap = new Map(map);
      const users = newMap.get(chatId) || [];
      if (isTyping && !users.includes(userId)) {
        newMap.set(chatId, [...users, userId]);
      } else if (!isTyping) {
        newMap.set(chatId, users.filter(id => id !== userId));
      }
      return newMap;
    });
  }

  getTypingUsersForChat(chatId: string): string[] {
    return this.typingUsers().get(chatId) || [];
  }

  getUserById(userId: string): User | undefined {
    if (this.sameId(userId, this.currentUser().id)) return this.currentUser();
    return this.usersCache.get(userId);
  }

  getNonArchivedChats() {
    return computed(() => this.chats().filter(c => !c.isArchived));
  }

  async startDirectChat(userId: string): Promise<string | null> {
    try {
      const raw = await this.api.createChat({
        type: 'Direct',
        participantIds: [userId]
      }).toPromise();
      if (!raw) return null;
      const chat = this.mapChat(raw);
      // Add or replace in chats list
      this.chats.update(chats => {
        const existing = chats.find(c => this.sameId(c.id, chat.id));
        if (existing) return chats;
        return this.sortChats([chat, ...chats]);
      });
      // Cache participants
      for (const p of chat.participants) this.usersCache.set(p.id, p);
      // Join SignalR group
      this.hub.joinChat(chat.id).catch(() => {});
      return chat.id;
    } catch (err) {
      console.error('Failed to start direct chat:', err);
      return null;
    }
  }

  /**
   * Create a group chat with multiple participants.
   */
  async createGroupChat(name: string, participantIds: string[]): Promise<string | null> {
    try {
      const raw = await this.api.createChat({
        type: 'Group',
        name,
        participantIds
      }).toPromise();
      if (!raw) return null;
      const chat = this.mapChat(raw);
      this.chats.update(chats => {
        const existing = chats.find(c => this.sameId(c.id, chat.id));
        if (existing) return chats;
        return this.sortChats([chat, ...chats]);
      });
      for (const p of chat.participants) this.usersCache.set(p.id, p);
      this.hub.joinChat(chat.id).catch(() => {});
      return chat.id;
    } catch (err) {
      console.error('Failed to create group chat:', err);
      return null;
    }
  }

  /**
   * Forward a message to another chat using E2EE re-encryption.
   * Returns true on success, false if forwarding is not possible.
   */
  async forwardMessage(targetChatId: string, originalMessage: Message): Promise<boolean> {
    // Phase 1: only text forwarding supported
    if (!originalMessage.text) {
      console.warn('Forward: only text messages are supported in Phase 1');
      return false;
    }

    const targetChat = this.getChatById(targetChatId);
    if (!targetChat) {
      console.error('Forward: target chat not found');
      return false;
    }

    // Get the original sender's display name
    const senderUser = this.getUserById(originalMessage.senderId);
    const displayName = senderUser?.name || 'Unknown';

    // Build recipient list (all participants except self)
    const recipientUserIds = targetChat.participants
      .filter(p => !this.sameId(p.id, this.currentUser().id))
      .map(p => p.id);

    // For saved messages, handle differently (no E2EE recipients)
    if (targetChat.type === 'saved') {
      // Add as local message with forwardedFrom
      const tempId = 'm_' + Math.random().toString(36).substring(2, 9);
      this.addMessage({
        id: tempId,
        chatId: targetChatId,
        senderId: this.currentUser().id,
        text: originalMessage.text,
        timestamp: Date.now(),
        status: 'sent',
        forwardedFrom: { userId: originalMessage.senderId, displayName }
      });
      return true;
    }

    try {
      // Create forwarded message optimistically with forwardedFrom label
      const tempId = 'm_' + Math.random().toString(36).substring(2, 9);
      const forwarded: Message = {
        id: tempId,
        chatId: targetChatId,
        senderId: this.currentUser().id,
        text: originalMessage.text,
        timestamp: Date.now(),
        status: 'sending',
        forwardedFrom: { userId: originalMessage.senderId, displayName }
      };
      this.messages.update(msgs => this.upsertMessages(msgs, [forwarded]));
      this.chats.update(chats => {
        const idx = chats.findIndex(c => this.sameId(c.id, targetChatId));
        if (idx === -1) return chats;
        const updated = { ...chats[idx], lastMessage: forwarded, unreadCount: 0 };
        const newChats = [...chats];
        newChats.splice(idx, 1);
        const insertIndex = newChats.filter(c => c.isPinned || c.type === 'saved').length;
        newChats.splice(insertIndex, 0, updated);
        return newChats;
      });

      // E2EE re-encrypt and send
      await this.e2ee.sendForwardedMessage(
        targetChatId,
        originalMessage.text,
        recipientUserIds,
        {
          userId: originalMessage.senderId,
          displayName,
          originalTimestamp: originalMessage.timestamp
        }
      );

      this.updateMessage(tempId, { status: 'sent' });
      this.audio.playSendSound();
      return true;
    } catch (err) {
      console.error('Forward failed:', err);
      return false;
    }
  }

  getArchivedChats() {
    return computed(() => this.chats().filter(c => c.isArchived));
  }

  // ═══════════════════════════════════════════
  //  Voice URL restoration (IndexedDB cache)
  // ═══════════════════════════════════════════

  private async restoreVoiceUrls(chatId: string) {
    const msgs = this.messages().filter(m => this.sameId(m.chatId, chatId));
    let updated = false;
    for (const m of msgs) {
      if (m.voice && m.voice.storageKey && !m.voice.url) {
        const blob = await this.voiceStorage.getVoice(m.voice.storageKey);
        if (blob) {
          m.voice.url = URL.createObjectURL(blob);
          updated = true;
        }
      }
    }
    if (updated) this.messages.set([...this.messages()]);
  }

  private normalizeChatType(raw: unknown): Chat['type'] {
    if (typeof raw === 'number') {
      return TYPE_MAP[raw] ?? 'direct';
    }
    const normalized = String(raw ?? '').trim().toLowerCase();
    return TYPE_STRING_MAP[normalized] ?? 'direct';
  }

  private normalizeMessageStatus(raw: unknown): Message['status'] {
    if (typeof raw === 'number') {
      return STATUS_MAP[raw] ?? 'sent';
    }
    const normalized = String(raw ?? '').trim().toLowerCase();
    return STATUS_STRING_MAP[normalized] ?? 'sent';
  }

  private normalizeAttachmentType(raw: unknown): Attachment['type'] {
    if (typeof raw === 'number') {
      return ATTACHMENT_TYPE_MAP[raw] ?? 'document';
    }

    const normalized = String(raw ?? '').trim().toLowerCase();
    return ATTACHMENT_TYPE_STRING_MAP[normalized] ?? 'document';
  }

  private mapAttachmentForApi(att: Attachment): {
    type: 'Image' | 'Video' | 'Audio' | 'Document';
    url: string;
    name?: string;
    size?: number;
    thumbnailUrl?: string;
  } {
    return {
      type: ATTACHMENT_TYPE_TO_API[att.type] ?? 'Document',
      url: att.url,
      name: att.name,
      size: att.size,
      thumbnailUrl: att.thumbnailUrl
    };
  }

  private normalizeId(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private sameId(a: unknown, b: unknown): boolean {
    return this.normalizeId(a) === this.normalizeId(b);
  }

  private upsertMessages(current: Message[], incoming: Message[]): Message[] {
    const mergedById = new Map<string, Message>();

    for (const msg of current) {
      mergedById.set(this.normalizeId(msg.id), msg);
    }

    for (const msg of incoming) {
      const key = this.normalizeId(msg.id);
      const existing = mergedById.get(key);
      mergedById.set(key, existing ? { ...existing, ...msg } : msg);
    }

    return Array.from(mergedById.values());
  }

  private dedupeChatsById(chats: Chat[]): Chat[] {
    const seen = new Set<string>();
    const deduped: Chat[] = [];
    for (const chat of chats) {
      const key = this.normalizeId(chat.id);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(chat);
    }
    return deduped;
  }

  private keepSingleSavedChat(chats: Chat[], preferredSavedId?: string): Chat[] {
    const savedChats = chats.filter(c => c.type === 'saved');
    if (savedChats.length <= 1) return chats;

    const preferred = preferredSavedId
      ? savedChats.find(c => this.sameId(c.id, preferredSavedId))
      : undefined;

    const keep = preferred ?? savedChats
      .slice()
      .sort((a, b) => this.getChatActivityTimestamp(b) - this.getChatActivityTimestamp(a))[0];

    return chats.filter(c => c.type !== 'saved' || this.sameId(c.id, keep.id));
  }

  private getChatActivityTimestamp(chat: Chat): number {
    return chat.lastMessage?.timestamp ?? 0;
  }

  private sortChats(chats: Chat[]): Chat[] {
    return [...chats].sort((a, b) => {
      if (a.type === 'saved' && b.type !== 'saved') return -1;
      if (b.type === 'saved' && a.type !== 'saved') return 1;
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return this.getChatActivityTimestamp(b) - this.getChatActivityTimestamp(a);
    });
  }

  private updateUserOnlineStatus(userId: string, isOnline: boolean) {
    const cached = this.usersCache.get(userId);
    if (cached) {
      this.usersCache.set(userId, { ...cached, isOnline, lastSeen: isOnline ? undefined : Date.now() });
    }
    // Targeted update: only spread chats that contain this user as a participant
    this.chats.update(chats => {
      let changed = false;
      const result = chats.map(chat => {
        const idx = chat.participants.findIndex(p => this.sameId(p.id, userId));
        if (idx === -1) return chat; // Unchanged — same reference
        changed = true;
        const newParticipants = [...chat.participants];
        newParticipants[idx] = { ...newParticipants[idx], isOnline, lastSeen: isOnline ? undefined : Date.now() };
        return { ...chat, participants: newParticipants };
      });
      return changed ? result : chats; // Avoid new array reference if nothing changed
    });
  }
}
