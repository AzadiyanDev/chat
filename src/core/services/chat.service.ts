import { Injectable, signal, computed, inject } from '@angular/core';
import { Chat, Message, User, Reaction } from '../../models/chat.model';
import { VoiceStorageService } from './voice-storage.service';
import { AudioService } from './audio.service';

const CURRENT_USER_ID = 'u_me';
const CURRENT_USER_STORAGE_KEY = 'telegram-current-user';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private voiceStorage = inject(VoiceStorageService);
  private audio = inject(AudioService);

  currentUser = signal<User>(this.loadCurrentUser());

  private mockUsers: User[] = [
    { id: 'u_1', name: 'Alice Cooper', isOnline: true, avatarUrl: 'https://i.pravatar.cc/200?img=1' },
    { id: 'u_2', name: 'Bob Smith', isOnline: false, lastSeen: Date.now() - 3600000, avatarUrl: 'https://i.pravatar.cc/200?img=3' },
    { id: 'u_3', name: 'Emily Zhang', isOnline: true, avatarUrl: 'https://i.pravatar.cc/200?img=5' },
    { id: 'u_4', name: 'David Wilson', isOnline: false, lastSeen: Date.now() - 7200000, avatarUrl: 'https://i.pravatar.cc/200?img=8' },
    { id: 'u_5', name: 'Sarah Johnson', isOnline: true, avatarUrl: 'https://i.pravatar.cc/200?img=9' },
    { id: 'u_6', name: 'Mike Chen', isOnline: false, lastSeen: Date.now() - 1800000, avatarUrl: 'https://i.pravatar.cc/200?img=11' },
    { id: 'u_7', name: 'Liam Brown', isOnline: true, avatarUrl: 'https://i.pravatar.cc/200?img=12' },
    { id: 'u_8', name: 'Sophia Martin', isOnline: false, lastSeen: Date.now() - 86400000, avatarUrl: 'https://i.pravatar.cc/200?img=16' },
  ];

  // Typing simulation
  typingUsers = signal<Map<string, string[]>>(new Map());
  private typingTimers = new Map<string, any>();
  private autoReplyTimers = new Map<string, any>();

  chats = signal<Chat[]>([
    {
      id: 'c_1', type: 'direct', participants: [this.mockUsers[0]],
      unreadCount: 2, isPinned: true,
      lastMessage: { id: 'm_1_last', chatId: 'c_1', senderId: 'u_1', text: 'Hey! Are we still on for tomorrow? 🎉', timestamp: Date.now() - 60000, status: 'seen' }
    },
    {
      id: 'c_2', type: 'direct', participants: [this.mockUsers[1]],
      unreadCount: 0, isPinned: true,
      lastMessage: { id: 'm_2_last', chatId: 'c_2', senderId: CURRENT_USER_ID, text: 'Sure, I\'ll send the docs later', timestamp: Date.now() - 3600000, status: 'delivered' }
    },
    {
      id: 'c_3', type: 'group', participants: [this.mockUsers[2], this.mockUsers[3], this.mockUsers[4]],
      name: 'Design Team', avatarUrl: 'https://i.pravatar.cc/200?img=20',
      memberCount: 5, description: 'Team design discussions',
      unreadCount: 5, isPinned: false,
      lastMessage: { id: 'm_3_last', chatId: 'c_3', senderId: 'u_3', text: 'Emily: Updated the Figma file ✅', timestamp: Date.now() - 1200000, status: 'seen' }
    },
    {
      id: 'c_4', type: 'direct', participants: [this.mockUsers[2]],
      unreadCount: 1, isPinned: false,
      lastMessage: { id: 'm_4_last', chatId: 'c_4', senderId: 'u_3', text: 'Can you review my PR? 🙏', timestamp: Date.now() - 7200000, status: 'seen' }
    },
    {
      id: 'c_5', type: 'channel', participants: [this.mockUsers[5]],
      name: 'Tech News', avatarUrl: 'https://i.pravatar.cc/200?img=30',
      memberCount: 12400, description: 'Latest tech updates',
      unreadCount: 12, isPinned: false,
      lastMessage: { id: 'm_5_last', chatId: 'c_5', senderId: 'u_6', text: 'Angular 22 just got released! 🚀', timestamp: Date.now() - 14400000, status: 'seen' }
    },
    {
      id: 'c_6', type: 'group', participants: [this.mockUsers[0], this.mockUsers[6], this.mockUsers[7]],
      name: 'Weekend Plans', avatarUrl: 'https://i.pravatar.cc/200?img=25',
      memberCount: 4,
      unreadCount: 0, isPinned: false,
      lastMessage: { id: 'm_6_last', chatId: 'c_6', senderId: 'u_7', text: 'Liam: Let\'s meet at 6! 🏖️', timestamp: Date.now() - 28800000, status: 'seen' }
    },
    {
      id: 'c_7', type: 'direct', participants: [this.mockUsers[3]],
      unreadCount: 0, isPinned: false,
      lastMessage: { id: 'm_7_last', chatId: 'c_7', senderId: 'u_4', text: 'Thanks for the help!', timestamp: Date.now() - 86400000, status: 'seen' }
    },
    {
      id: 'c_8', type: 'direct', participants: [this.mockUsers[7]],
      unreadCount: 3, isPinned: false, isArchived: true,
      lastMessage: { id: 'm_8_last', chatId: 'c_8', senderId: 'u_8', text: 'Happy birthday! 🎂', timestamp: Date.now() - 172800000, status: 'seen' }
    },
  ]);

  private DAY = 86400000;

  messages = signal<Message[]>([
    // Chat 1 — Alice Cooper
    { id: 'm_1_01', chatId: 'c_1', senderId: 'u_1', text: 'Hello! 👋', timestamp: Date.now() - this.DAY - 100000, status: 'seen' },
    { id: 'm_1_02', chatId: 'c_1', senderId: CURRENT_USER_ID, text: 'Hi Alice, how are you?', timestamp: Date.now() - this.DAY - 90000, status: 'seen' },
    { id: 'm_1_03', chatId: 'c_1', senderId: 'u_1', text: 'I\'m great! Working on the new project 💻', timestamp: Date.now() - this.DAY - 80000, status: 'seen' },
    { id: 'm_1_04', chatId: 'c_1', senderId: 'u_1', text: 'Have you seen the new design specs?', timestamp: Date.now() - this.DAY - 75000, status: 'seen' },
    { id: 'm_1_05', chatId: 'c_1', senderId: CURRENT_USER_ID, text: 'Not yet, send me the link', timestamp: Date.now() - this.DAY - 60000, status: 'seen' },
    { id: 'm_1_06', chatId: 'c_1', senderId: 'u_1', text: 'Sure! Here you go 📎', timestamp: Date.now() - this.DAY - 50000, status: 'seen' },
    { id: 'm_1_07', chatId: 'c_1', senderId: CURRENT_USER_ID, text: 'This looks amazing! Love the glassmorphism approach 🔥', timestamp: Date.now() - 600000, status: 'seen',
      reactions: [{ emoji: '❤️', userIds: ['u_1'] }]
    },
    { id: 'm_1_08', chatId: 'c_1', senderId: 'u_1', text: 'Right?! The animations are going to be insane', timestamp: Date.now() - 300000, status: 'seen' },
    { id: 'm_1_09', chatId: 'c_1', senderId: CURRENT_USER_ID, text: 'Can\'t wait to implement the particle effects', timestamp: Date.now() - 120000, status: 'seen',
      reactions: [{ emoji: '🔥', userIds: ['u_1'] }, { emoji: '👍', userIds: ['u_1'] }]
    },
    { id: 'm_1_10', chatId: 'c_1', senderId: 'u_1', text: 'Hey! Are we still on for tomorrow? 🎉', timestamp: Date.now() - 60000, status: 'seen' },

    // Chat 2 — Bob Smith
    { id: 'm_2_01', chatId: 'c_2', senderId: 'u_2', text: 'Hey, can you send me the project docs?', timestamp: Date.now() - 7200000, status: 'seen' },
    { id: 'm_2_02', chatId: 'c_2', senderId: CURRENT_USER_ID, text: 'Which ones? The API docs or the design system?', timestamp: Date.now() - 7100000, status: 'seen' },
    { id: 'm_2_03', chatId: 'c_2', senderId: 'u_2', text: 'Both if possible 😅', timestamp: Date.now() - 7000000, status: 'seen' },
    { id: 'm_2_04', chatId: 'c_2', senderId: CURRENT_USER_ID, text: 'Sure, I\'ll send the docs later', timestamp: Date.now() - 3600000, status: 'delivered' },

    // Chat 3 — Design Team
    { id: 'm_3_01', chatId: 'c_3', senderId: 'u_5', text: 'Team meeting at 3pm today', timestamp: Date.now() - 86400000, status: 'seen' },
    { id: 'm_3_02', chatId: 'c_3', senderId: 'u_4', text: 'Got it! 👍', timestamp: Date.now() - 86000000, status: 'seen' },
    { id: 'm_3_03', chatId: 'c_3', senderId: CURRENT_USER_ID, text: 'I\'ll prepare the presentation slides', timestamp: Date.now() - 85000000, status: 'seen' },
    { id: 'm_3_04', chatId: 'c_3', senderId: 'u_3', text: 'Perfect. I already shared the color palette in Figma', timestamp: Date.now() - 3600000, status: 'seen' },
    { id: 'm_3_05', chatId: 'c_3', senderId: 'u_3', text: 'Updated the Figma file ✅', timestamp: Date.now() - 1200000, status: 'seen',
      reactions: [{ emoji: '👍', userIds: [CURRENT_USER_ID, 'u_4', 'u_5'] }]
    },

    // Chat 4 — Emily Zhang (direct)
    { id: 'm_4_01', chatId: 'c_4', senderId: CURRENT_USER_ID, text: 'Hey Emily!', timestamp: Date.now() - 14400000, status: 'seen' },
    { id: 'm_4_02', chatId: 'c_4', senderId: 'u_3', text: 'Hi! Just finished the sidebar component', timestamp: Date.now() - 14000000, status: 'seen' },
    { id: 'm_4_03', chatId: 'c_4', senderId: 'u_3', text: 'Can you review my PR? 🙏', timestamp: Date.now() - 7200000, status: 'seen',
      replyToId: 'm_4_01'
    },

    // Chat 5 — Tech News channel  
    { id: 'm_5_01', chatId: 'c_5', senderId: 'u_6', text: '📢 Breaking: TypeScript 6.0 is here with pattern matching!', timestamp: Date.now() - 86400000, status: 'seen',
      reactions: [{ emoji: '🔥', userIds: ['u_1', 'u_2', 'u_3'] }, { emoji: '😮', userIds: ['u_4', 'u_5'] }]
    },
    { id: 'm_5_02', chatId: 'c_5', senderId: 'u_6', text: 'Angular 22 just got released! 🚀\n\nNew features:\n• Signal-based components by default\n• Built-in animations API\n• Zero-config SSR', timestamp: Date.now() - 14400000, status: 'seen',
      reactions: [{ emoji: '❤️', userIds: [CURRENT_USER_ID, 'u_1'] }, { emoji: '🚀', userIds: ['u_2', 'u_3', 'u_4'] }]
    },

    // Chat 6 — Weekend Plans group
    { id: 'm_6_01', chatId: 'c_6', senderId: 'u_1', text: 'Anyone up for hiking this weekend? 🏔️', timestamp: Date.now() - 86400000, status: 'seen' },
    { id: 'm_6_02', chatId: 'c_6', senderId: CURRENT_USER_ID, text: 'I\'m in! What trail are we thinking?', timestamp: Date.now() - 80000000, status: 'seen' },
    { id: 'm_6_03', chatId: 'c_6', senderId: 'u_7', text: 'Let\'s do the canyon trail, it has great views', timestamp: Date.now() - 50000000, status: 'seen' },
    { id: 'm_6_04', chatId: 'c_6', senderId: 'u_8', text: 'Sounds fun! Count me in 🙌', timestamp: Date.now() - 40000000, status: 'seen' },
    { id: 'm_6_05', chatId: 'c_6', senderId: 'u_7', text: 'Let\'s meet at 6! 🏖️', timestamp: Date.now() - 28800000, status: 'seen' },

    // Chat 7 — David Wilson
    { id: 'm_7_01', chatId: 'c_7', senderId: CURRENT_USER_ID, text: 'Here\'s the solution for that bug', timestamp: Date.now() - 172800000, status: 'seen' },
    { id: 'm_7_02', chatId: 'c_7', senderId: 'u_4', text: 'Thanks for the help!', timestamp: Date.now() - 86400000, status: 'seen',
      reactions: [{ emoji: '🙏', userIds: ['u_4'] }]
    },
  ]);

  private autoReplyMessages = [
    'Sounds great! 🎉',
    'Got it, thanks!',
    'That\'s awesome! 💪',
    'Let me check and get back to you',
    'Perfect! 👌',
    'Haha nice one 😂',
    'I agree! Let\'s do it',
    'Working on it now...',
    'Sure thing! 🙌',
    'Interesting... tell me more!'
  ];

  private defaultCurrentUser(): User {
    return {
      id: CURRENT_USER_ID,
      name: 'My Account',
      username: 'my_account',
      bio: 'Building this Telegram clone.',
      avatarUrl: 'https://i.pravatar.cc/200?img=15',
      isOnline: true
    };
  }

  private loadCurrentUser(): User {
    try {
      const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
      if (!raw) return this.defaultCurrentUser();
      const parsed = JSON.parse(raw) as Partial<User>;
      return {
        ...this.defaultCurrentUser(),
        ...parsed,
        id: CURRENT_USER_ID,
        isOnline: true
      };
    } catch {
      return this.defaultCurrentUser();
    }
  }

  private persistCurrentUser(user: User) {
    try {
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    } catch {}
  }

  constructor() {
    this.restoreVoices();
  }

  private async restoreVoices() {
    const msgs = this.messages();
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
    if (updated) this.messages.set([...msgs]);
  }

  getChatById(chatId: string): Chat | undefined {
    return this.chats().find(c => c.id === chatId);
  }

  getMessagesForChat(chatId: string) {
    return computed(() => this.messages().filter(m => m.chatId === chatId && !m.isDeleted).sort((a, b) => a.timestamp - b.timestamp));
  }
  
  getMessageById(messageId: string): Message | undefined {
    return this.messages().find(m => m.id === messageId);
  }

  getParticipant(chat: Chat): User | undefined {
    if (chat.type === 'group' || chat.type === 'channel') return undefined;
    return chat.participants.find(p => p.id !== CURRENT_USER_ID);
  }

  addMessage(message: Message) {
    this.messages.update(msgs => [...msgs, message]);
    
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

    // Auto-reply simulation for direct chats
    if (message.senderId === CURRENT_USER_ID) {
      const chat = this.getChatById(message.chatId);
      if (chat && chat.type === 'direct') {
        this.simulateAutoReply(message.chatId, chat.participants[0]?.id);
      }
    }
  }

  updateMessage(id: string, updates: Partial<Message>) {
    this.messages.update(msgs => msgs.map(m => m.id === id ? { ...m, ...updates } : m));
  }

  deleteMessage(messageId: string): boolean {
    const msg = this.getMessageById(messageId);
    if (!msg) return false;
    this.updateMessage(messageId, { isDeleted: true });
    return true;
  }

  addReaction(messageId: string, emoji: string) {
    this.messages.update(msgs => msgs.map(m => {
      if (m.id !== messageId) return m;
      const reactions = [...(m.reactions || [])];
      const existing = reactions.find(r => r.emoji === emoji);
      if (existing) {
        if (existing.userIds.includes(CURRENT_USER_ID)) {
          existing.userIds = existing.userIds.filter(id => id !== CURRENT_USER_ID);
          if (existing.userIds.length === 0) {
            return { ...m, reactions: reactions.filter(r => r.emoji !== emoji) };
          }
        } else {
          existing.userIds = [...existing.userIds, CURRENT_USER_ID];
        }
        return { ...m, reactions: [...reactions] };
      }
      return { ...m, reactions: [...reactions, { emoji, userIds: [CURRENT_USER_ID] }] };
    }));
    this.audio.playReactionSound();
  }

  markAsRead(chatId: string) {
    this.chats.update(chats => chats.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
  }

  updateCurrentUserProfile(updates: Partial<Pick<User, 'name' | 'username' | 'bio' | 'avatarUrl'>>) {
    const current = this.currentUser();
    const next: User = {
      ...current,
      ...updates,
      id: CURRENT_USER_ID,
      isOnline: true,
      name: (updates.name ?? current.name).trim() || current.name,
      username: (updates.username ?? current.username ?? '').trim() || current.username || 'my_account',
      bio: (updates.bio ?? current.bio ?? '').trim()
    };
    this.currentUser.set(next);
    this.persistCurrentUser(next);
  }

  // ========== Typing Simulation ==========

  private simulateAutoReply(chatId: string, userId: string) {
    // Clear existing timers for this chat
    if (this.autoReplyTimers.has(chatId)) {
      clearTimeout(this.autoReplyTimers.get(chatId));
    }
    if (this.typingTimers.has(chatId)) {
      clearTimeout(this.typingTimers.get(chatId));
    }

    // Start typing after 1.5s
    const typingTimer = setTimeout(() => {
      this.setTyping(chatId, userId, true);
      
      // Send reply after 2-4s of typing
      const replyDelay = 2000 + Math.random() * 2000;
      const replyTimer = setTimeout(() => {
        this.setTyping(chatId, userId, false);
        
        const replyText = this.autoReplyMessages[Math.floor(Math.random() * this.autoReplyMessages.length)];
        const replyMsg: Message = {
          id: 'm_reply_' + Date.now(),
          chatId,
          senderId: userId,
          text: replyText,
          timestamp: Date.now(),
          status: 'seen'
        };
        
        this.messages.update(msgs => [...msgs, replyMsg]);
        this.chats.update(chats => chats.map(c =>
          c.id === chatId ? { ...c, lastMessage: replyMsg } : c
        ));
        this.audio.playReceiveSound();
      }, replyDelay);

      this.autoReplyTimers.set(chatId, replyTimer);
    }, 1500);

    this.typingTimers.set(chatId, typingTimer);
  }

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
    if (userId === CURRENT_USER_ID) return this.currentUser();
    return this.mockUsers.find(u => u.id === userId);
  }

  getNonArchivedChats() {
    return computed(() => this.chats().filter(c => !c.isArchived));
  }

  getArchivedChats() {
    return computed(() => this.chats().filter(c => c.isArchived));
  }
}
