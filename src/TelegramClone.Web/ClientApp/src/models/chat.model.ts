export interface User {
  id: string;
  name: string;
  username?: string;
  bio?: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen?: number;
}

export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  name?: string;
  size?: number;
  thumbnailUrl?: string;
  progress?: number; 
}

export interface VoiceNote {
  storageKey?: string;
  url: string;
  duration: number;
  durationMs: number;
  waveform: number[];
}

export interface Reaction {
  emoji: string;
  userIds: string[];
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text?: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'seen';
  attachments?: Attachment[];
  voice?: VoiceNote;
  replyToId?: string;
  isAnimating?: boolean;
  isDeleted?: boolean;
  reactions?: Reaction[];
}

export interface Chat {
  id: string;
  type: 'direct' | 'group' | 'channel';
  participants: User[];
  lastMessage?: Message;
  unreadCount: number;
  isPinned: boolean;
  isArchived?: boolean;
  name?: string;
  avatarUrl?: string;
  description?: string;
  memberCount?: number;
}
