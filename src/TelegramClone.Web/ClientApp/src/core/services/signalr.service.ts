import { Injectable, signal } from '@angular/core';

declare var signalR: any;

@Injectable({ providedIn: 'root' })
export class SignalRService {
  private connection: any = null;
  isConnected = signal(false);

  private messageHandlers: ((message: any) => void)[] = [];
  private messageDeletedHandlers: ((messageId: string) => void)[] = [];
  private reactionHandlers: ((message: any) => void)[] = [];
  private typingHandlers: ((chatId: string, userId: string) => void)[] = [];
  private stoppedTypingHandlers: ((chatId: string, userId: string) => void)[] = [];
  private onlineHandlers: ((userId: string) => void)[] = [];
  private offlineHandlers: ((userId: string) => void)[] = [];
  private statusHandlers: ((messageId: string, status: string) => void)[] = [];
  private envelopeReadyHandlers: (() => void)[] = [];
  private keyChangeHandlers: ((userId: string, deviceId: number) => void)[] = [];

  async start(): Promise<void> {
    if (this.connection) return;

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

      this.connection.on('UserOnline', (userId: string) => {
        this.onlineHandlers.forEach(h => h(userId));
      });

      this.connection.on('UserOffline', (userId: string) => {
        this.offlineHandlers.forEach(h => h(userId));
      });

      this.connection.on('MessageStatusChanged', (messageId: string, status: string) => {
        this.statusHandlers.forEach(h => h(messageId, status));
      });

      this.connection.on('EnvelopeReady', () => {
        this.envelopeReadyHandlers.forEach(h => h());
      });

      this.connection.on('KeyChange', (userId: string, deviceId: number) => {
        this.keyChangeHandlers.forEach(h => h(userId, deviceId));
      });

      this.connection.onreconnected(() => {
        this.isConnected.set(true);
      });

      this.connection.onclose(() => {
        this.isConnected.set(false);
      });

      await this.connection.start();
      this.isConnected.set(true);
    } catch (err) {
      console.error('SignalR connection failed:', err);
      this.isConnected.set(false);
    }
  }

  async stop(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
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

  onUserOnline(handler: (userId: string) => void): () => void {
    this.onlineHandlers.push(handler);
    return () => { this.onlineHandlers = this.onlineHandlers.filter(h => h !== handler); };
  }

  onUserOffline(handler: (userId: string) => void): () => void {
    this.offlineHandlers.push(handler);
    return () => { this.offlineHandlers = this.offlineHandlers.filter(h => h !== handler); };
  }

  onMessageStatusChanged(handler: (messageId: string, status: string) => void): () => void {
    this.statusHandlers.push(handler);
    return () => { this.statusHandlers = this.statusHandlers.filter(h => h !== handler); };
  }

  onEnvelopeReady(handler: () => void): () => void {
    this.envelopeReadyHandlers.push(handler);
    return () => { this.envelopeReadyHandlers = this.envelopeReadyHandlers.filter(h => h !== handler); };
  }

  onKeyChange(handler: (userId: string, deviceId: number) => void): () => void {
    this.keyChangeHandlers.push(handler);
    return () => { this.keyChangeHandlers = this.keyChangeHandlers.filter(h => h !== handler); };
  }
}
