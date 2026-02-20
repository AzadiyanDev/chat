import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { Chat, Message, User, Reaction } from '../../models/chat.model';
import { VoiceStorageService } from './voice-storage.service';
import { AudioService } from './audio.service';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SignalRService } from './signalr.service';

const STATUS_MAP: Record<number, Message['status']> = { 0: 'sending', 1: 'sent', 2: 'delivered', 3: 'seen' };
const TYPE_MAP: Record<number, Chat['type']> = { 0: 'direct', 1: 'group', 2: 'channel' };

@Injectable({ providedIn: 'root' })
export class ChatService {
  private voiceStorage = inject(VoiceStorageService);
  private audio = inject(AudioService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private hub = inject(SignalRService);

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
  private initialized = false;

  constructor() {
    this.setupSignalRHandlers();

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
      if (message.senderId === this.currentUser().id) return;
      this.messages.update(msgs => [...msgs, message]);
      this.chats.update(chats => chats.map(c =>
        c.id === message.chatId
          ? { ...c, lastMessage: message, unreadCount: c.unreadCount + 1 }
          : c
      ));
      this.audio.playReceiveSound();
    });

    this.hub.onMessageDeleted((messageId: string) => {
      this.updateMessage(messageId, { isDeleted: true });
    });

    this.hub.onReactionUpdated((data: any) => {
      if (data.messageId && data.reactions) {
        const reactions = (data.reactions as any[]).map(r => ({
          emoji: r.emoji,
          userIds: (r.userIds || []).map((id: any) => String(id))
        }));
        this.updateMessage(String(data.messageId), { reactions });
      }
    });

    this.hub.onUserTyping((chatId, userId) => this.setTyping(chatId, userId, true));
    this.hub.onUserStoppedTyping((chatId, userId) => this.setTyping(chatId, userId, false));

    this.hub.onUserOnline((userId) => this.updateUserOnlineStatus(userId, true));
    this.hub.onUserOffline((userId) => this.updateUserOnlineStatus(userId, false));

    this.hub.onMessageStatusChanged((messageId, status) => {
      this.updateMessage(messageId, { status: status as Message['status'] });
    });
  }

  // ═══════════════════════════════════════════
  //  Initial data loading
  // ═══════════════════════════════════════════

  private async loadChats() {
    try {
      const raw = await this.api.getChats().toPromise();
      if (!raw) return;
      const chats = raw.map((c: any) => this.mapChat(c));
      this.chats.set(chats);

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
      this.messages.update(msgs => [...msgs.filter(m => m.chatId !== chatId), ...incoming]);
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
      type: typeof d.type === 'number' ? (TYPE_MAP[d.type] ?? 'direct') : (d.type || 'direct'),
      participants: (d.participants || []).map((p: any) => this.mapUser(p)),
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
      status: typeof d.status === 'number' ? (STATUS_MAP[d.status] ?? 'sent') : (d.status || 'sent'),
      attachments: d.attachments,
      voice: d.voice ? {
        url: d.voice.url || '',
        duration: d.voice.duration || 0,
        durationMs: d.voice.durationMs || 0,
        waveform: d.voice.waveform || [],
        storageKey: d.voice.storageKey
      } : undefined,
      replyToId: d.replyToId ? String(d.replyToId) : undefined,
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
    return this.chats().find(c => c.id === chatId);
  }

  getMessagesForChat(chatId: string) {
    // Trigger lazy load if not yet loaded
    this.ensureMessagesLoaded(chatId);
    return computed(() =>
      this.messages()
        .filter(m => m.chatId === chatId && !m.isDeleted)
        .sort((a, b) => a.timestamp - b.timestamp)
    );
  }

  getMessageById(messageId: string): Message | undefined {
    return this.messages().find(m => m.id === messageId);
  }

  getParticipant(chat: Chat): User | undefined {
    if (chat.type === 'group' || chat.type === 'channel') return undefined;
    return chat.participants.find(p => p.id !== this.currentUser().id);
  }

  addMessage(message: Message) {
    // Optimistic local add
    this.messages.update(msgs => [...msgs, message]);

    // Re-order chats (pinned stay on top)
    this.chats.update(chats => {
      const chatIndex = chats.findIndex(c => c.id === message.chatId);
      if (chatIndex === -1) return chats;
      const updatedChat = { ...chats[chatIndex], lastMessage: message, unreadCount: 0 };
      const newChats = [...chats];
      newChats.splice(chatIndex, 1);
      const insertIndex = updatedChat.isPinned ? 0 : chats.filter(c => c.isPinned).length;
      newChats.splice(insertIndex, 0, updatedChat);
      return newChats;
    });

    // Fire-and-forget API send for own messages
    if (message.senderId === this.currentUser().id) {
      this.api.sendMessage(message.chatId, {
        text: message.text,
        replyToId: message.replyToId
      }).subscribe({
        error: (err: any) => console.error('Failed to send message:', err)
      });
    }
  }

  updateMessage(id: string, updates: Partial<Message>) {
    this.messages.update(msgs => msgs.map(m => m.id === id ? { ...m, ...updates } : m));
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
    this.chats.update(chats => chats.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
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
    if (userId === this.currentUser().id) return this.currentUser();
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
        const existing = chats.find(c => c.id === chat.id);
        if (existing) return chats;
        return [chat, ...chats];
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

  getArchivedChats() {
    return computed(() => this.chats().filter(c => c.isArchived));
  }

  // ═══════════════════════════════════════════
  //  Voice URL restoration (IndexedDB cache)
  // ═══════════════════════════════════════════

  private async restoreVoiceUrls(chatId: string) {
    const msgs = this.messages().filter(m => m.chatId === chatId);
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

  private updateUserOnlineStatus(userId: string, isOnline: boolean) {
    const cached = this.usersCache.get(userId);
    if (cached) {
      this.usersCache.set(userId, { ...cached, isOnline, lastSeen: isOnline ? undefined : Date.now() });
    }
    this.chats.update(chats => chats.map(chat => ({
      ...chat,
      participants: chat.participants.map(p =>
        p.id === userId ? { ...p, isOnline, lastSeen: isOnline ? undefined : Date.now() } : p
      )
    })));
  }
}
