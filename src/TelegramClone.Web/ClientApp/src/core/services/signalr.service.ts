import { Injectable, signal } from '@angular/core';

export interface PresenceEventPayload {
  userId: string;
  isOnline: boolean;
  lastSeenUtc?: string | null;
  changedAtUtc?: string | null;
}

@Injectable({ providedIn: 'root' })
export class SignalRService {
  private connection: any = null;
  private connecting = false;
  isConnected = signal(false);
  private visibilityHandler: (() => void) | null = null;

  private messageHandlers: ((message: any) => void)[] = [];
  private messageDeletedHandlers: ((messageId: string) => void)[] = [];
  private reactionHandlers: ((message: any) => void)[] = [];
  private typingHandlers: ((chatId: string, userId: string) => void)[] = [];
  private stoppedTypingHandlers: ((chatId: string, userId: string) => void)[] = [];
  private onlineHandlers: ((payload: PresenceEventPayload) => void)[] = [];
  private offlineHandlers: ((payload: PresenceEventPayload) => void)[] = [];
  private statusHandlers: ((messageId: string, status: string) => void)[] = [];
  private envelopeReadyHandlers: ((data: { destinationDeviceId: number; timestamp: string }) => void)[] = [];
  private keyChangeHandlers: ((data: { userId: string; timestamp: string }) => void)[] = [];

  async start(): Promise<void> {
    if (this.connection || this.connecting) return;
    this.connecting = true;

    try {
      // Dynamic import for @microsoft/signalr
      const signalRModule = await import('@microsoft/signalr');

      this.connection = new signalRModule.HubConnectionBuilder()
        .withUrl('/chatHub')
        .withAutomaticReconnect()
        .build();

      // Register handlers
      this.connection.on('ReceiveMessage', (message: any) => {
        this.messageHandlers.forEach(h => h(message));
      });

      this.connection.on('MessageDeleted', (messageId: string) => {
        this.messageDeletedHandlers.forEach(h => h(messageId));
      });

      this.connection.on('ReactionUpdated', (message: any) => {
        this.reactionHandlers.forEach(h => h(message));
      });

      this.connection.on('UserTyping', (chatId: string, userId: string) => {
        this.typingHandlers.forEach(h => h(chatId, userId));
      });

      this.connection.on('UserStoppedTyping', (chatId: string, userId: string) => {
        this.stoppedTypingHandlers.forEach(h => h(chatId, userId));
      });

      this.connection.on('UserOnline', (raw: any) => {
        const payload = this.normalizePresencePayload(raw, true);
        if (!payload) return;
        this.onlineHandlers.forEach(h => h(payload));
      });

      this.connection.on('UserOffline', (raw: any) => {
        const payload = this.normalizePresencePayload(raw, false);
        if (!payload) return;
        this.offlineHandlers.forEach(h => h(payload));
      });

      this.connection.on('MessageStatusChanged', (messageId: string, status: string) => {
        this.statusHandlers.forEach(h => h(messageId, status));
      });

      this.connection.on('NewEnvelope', (data: { destinationDeviceId: number; timestamp: string }) => {
        this.envelopeReadyHandlers.forEach(h => h(data));
      });

      this.connection.on('KeyBundleChanged', (data: { userId: string; timestamp: string }) => {
        this.keyChangeHandlers.forEach(h => h(data));
      });

      this.connection.onreconnected(() => {
        this.isConnected.set(true);
      });

      this.connection.onclose(() => {
        this.isConnected.set(false);
      });

      await this.connection.start();
      this.isConnected.set(true);

      // Reconnect when tab becomes visible (handles mobile/sleep disconnects)
      this.removeVisibilityHandler();
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible' && this.connection && !this.isConnected()) {
          this.connection.start().then(() => this.isConnected.set(true)).catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    } catch (err) {
      console.error('SignalR connection failed:', err);
      this.connection = null;
      this.isConnected.set(false);
    } finally {
      this.connecting = false;
    }
  }

  private removeVisibilityHandler(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  async stop(): Promise<void> {
    this.removeVisibilityHandler();
    if (this.connection) {
      try { await this.connection.stop(); } catch {}
      this.connection = null;
      this.isConnected.set(false);
    }
  }

  // ──── Group management ────
  async joinChat(chatId: string): Promise<void> {
    if (this.connection) {
      await this.connection.invoke('JoinChat', chatId);
    }
  }

  async leaveChat(chatId: string): Promise<void> {
    if (this.connection) {
      await this.connection.invoke('LeaveChat', chatId);
    }
  }

  // ──── Typing ────
  async startTyping(chatId: string): Promise<void> {
    if (this.connection) {
      await this.connection.invoke('StartTyping', chatId);
    }
  }

  async stopTyping(chatId: string): Promise<void> {
    if (this.connection) {
      await this.connection.invoke('StopTyping', chatId);
    }
  }

  // ──── Message status ────
  async messageDelivered(chatId: string, messageId: string): Promise<void> {
    if (this.connection) {
      await this.connection.invoke('MessageDelivered', chatId, messageId);
    }
  }

  async messageSeen(chatId: string, messageId: string): Promise<void> {
    if (this.connection) {
      await this.connection.invoke('MessageSeen', chatId, messageId);
    }
  }

  // ──── Event subscription ────
  onMessage(handler: (message: any) => void): () => void {
    this.messageHandlers.push(handler);
    return () => { this.messageHandlers = this.messageHandlers.filter(h => h !== handler); };
  }

  onMessageDeleted(handler: (messageId: string) => void): () => void {
    this.messageDeletedHandlers.push(handler);
    return () => { this.messageDeletedHandlers = this.messageDeletedHandlers.filter(h => h !== handler); };
  }

  onReactionUpdated(handler: (message: any) => void): () => void {
    this.reactionHandlers.push(handler);
    return () => { this.reactionHandlers = this.reactionHandlers.filter(h => h !== handler); };
  }

  onUserTyping(handler: (chatId: string, userId: string) => void): () => void {
    this.typingHandlers.push(handler);
    return () => { this.typingHandlers = this.typingHandlers.filter(h => h !== handler); };
  }

  onUserStoppedTyping(handler: (chatId: string, userId: string) => void): () => void {
    this.stoppedTypingHandlers.push(handler);
    return () => { this.stoppedTypingHandlers = this.stoppedTypingHandlers.filter(h => h !== handler); };
  }

  onUserOnline(handler: (payload: PresenceEventPayload) => void): () => void {
    this.onlineHandlers.push(handler);
    return () => { this.onlineHandlers = this.onlineHandlers.filter(h => h !== handler); };
  }

  onUserOffline(handler: (payload: PresenceEventPayload) => void): () => void {
    this.offlineHandlers.push(handler);
    return () => { this.offlineHandlers = this.offlineHandlers.filter(h => h !== handler); };
  }

  onMessageStatusChanged(handler: (messageId: string, status: string) => void): () => void {
    this.statusHandlers.push(handler);
    return () => { this.statusHandlers = this.statusHandlers.filter(h => h !== handler); };
  }

  onEnvelopeReady(handler: (data: { destinationDeviceId: number; timestamp: string }) => void): () => void {
    this.envelopeReadyHandlers.push(handler);
    return () => { this.envelopeReadyHandlers = this.envelopeReadyHandlers.filter(h => h !== handler); };
  }

  onKeyBundleChanged(handler: (data: { userId: string; timestamp: string }) => void): () => void {
    this.keyChangeHandlers.push(handler);
    return () => { this.keyChangeHandlers = this.keyChangeHandlers.filter(h => h !== handler); };
  }

  private normalizePresencePayload(raw: any, isOnline: boolean): PresenceEventPayload | null {
    if (typeof raw === 'string' || typeof raw === 'number') {
      const userId = String(raw ?? '').trim();
      if (!userId) return null;
      return { userId, isOnline };
    }

    const userId = String(raw?.userId ?? '').trim();
    if (!userId) return null;

    return {
      userId,
      isOnline: typeof raw?.isOnline === 'boolean' ? raw.isOnline : isOnline,
      lastSeenUtc: raw?.lastSeenUtc ?? null,
      changedAtUtc: raw?.changedAtUtc ?? null
    };
  }
}
