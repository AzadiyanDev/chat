import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SignalProtocolService } from './signal-protocol.service';
import { AttachmentCryptoService } from './attachment-crypto.service';
import { SavedMessagesCryptoService, SavedMessageEnvelope } from './saved-messages-crypto.service';
import { KeyStoreService } from './key-store.service';
import { ApiService } from './api.service';
import { SignalRService } from './signalr.service';
import type {
  PlaintextContent, SubmitEnvelope, EnvelopeResponse,
  EnvelopeType, KeyBundleResponse, AttachmentPointer, VoicePointer
} from '../../models/e2ee.model';

const PREKEY_LOW_THRESHOLD = 20;
const PREKEY_REPLENISH_COUNT = 80;

/**
 * Orchestrates the full E2EE message lifecycle:
 *   encrypt → envelope → send → receive → decrypt
 *
 * This is the main service that components interact with.
 * All crypto details are delegated to SignalProtocolService and AttachmentCryptoService.
 */
@Injectable({ providedIn: 'root' })
export class E2eeMessageService {

  private signal = inject(SignalProtocolService);
  private attachmentCrypto = inject(AttachmentCryptoService);
  private savedCrypto = inject(SavedMessagesCryptoService);
  private keyStore = inject(KeyStoreService);
  private api = inject(ApiService);
  private signalR = inject(SignalRService);

  private localDeviceId: number = 0;
  private localUserId: string = '';
  private nextPreKeyId = 101; // After initial 100

  // ──── Setup ────

  /**
   * Initialize E2EE for the current user.
   * Call after login + passphrase unlock.
   */
  async setup(userId: string): Promise<void> {
    this.localUserId = userId;
    await this.keyStore.initialize();

    // Register device
    const deviceResponse = await firstValueFrom(this.api.registerDevice('Web Browser'));
    this.localDeviceId = deviceResponse.deviceId;

    // Initialize identity + upload key bundle
    const bundle = await this.signal.initializeIdentity(this.localDeviceId);
    await firstValueFrom(this.api.uploadKeyBundle(this.localDeviceId, bundle));

    // Start listening for envelopes
    this.startEnvelopePolling();
  }

  // ──── Send Encrypted Message ────

  /**
   * Encrypt and send a text message to all devices of all participants in a chat.
   */
  async sendMessage(
    chatId: string,
    text: string,
    recipientUserIds: string[],
    replyToId?: string
  ): Promise<void> {
    const content: PlaintextContent = {
      body: text,
      timestamp: Date.now(),
      chatId,
      senderId: this.localUserId,
      replyToId
    };

    await this.sendToRecipients(content, recipientUserIds);
  }

  /**
   * Encrypt and send a file attachment with E2EE.
   */
  async sendAttachment(
    chatId: string,
    file: File,
    recipientUserIds: string[],
    text?: string
  ): Promise<void> {
    const plaintext = await file.arrayBuffer();

    // Encrypt attachment
    const { pointer, chunks } = await this.attachmentCrypto.encryptAttachment(
      plaintext, file.type, file.name
    );

    // Upload encrypted chunks to server
    const initResp = await firstValueFrom(this.api.initiateUpload(chunks.length));

    for (let i = 0; i < chunks.length; i++) {
      await firstValueFrom(this.api.uploadChunk(initResp.attachmentId, i, chunks[i]));
    }

    await firstValueFrom(this.api.completeUpload(initResp.attachmentId));

    // Build content with attachment pointer
    const attachmentPointer: AttachmentPointer = {
      attachmentId: initResp.attachmentId,
      ...pointer,
      chunkSize: pointer.chunkSize ?? 65536,
      streamHeader: pointer.streamHeader
    };

    const content: PlaintextContent = {
      body: text,
      attachments: [attachmentPointer],
      timestamp: Date.now(),
      chatId,
      senderId: this.localUserId
    };

    await this.sendToRecipients(content, recipientUserIds);
  }

  /**
   * Encrypt and send a voice note with E2EE.
   */
  async sendVoiceNote(
    chatId: string,
    audioBlob: Blob,
    duration: number,
    waveform: number[],
    codec: string,
    recipientUserIds: string[]
  ): Promise<void> {
    const { pointer, chunks } = await this.attachmentCrypto.encryptVoiceNote(
      audioBlob, duration, waveform, codec
    );

    // Upload encrypted chunks
    const initResp = await firstValueFrom(this.api.initiateUpload(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await firstValueFrom(this.api.uploadChunk(initResp.attachmentId, i, chunks[i]));
    }
    await firstValueFrom(this.api.completeUpload(initResp.attachmentId));

    const voicePointer: VoicePointer = {
      attachmentId: initResp.attachmentId,
      ...pointer
    };

    const content: PlaintextContent = {
      voiceNote: voicePointer,
      timestamp: Date.now(),
      chatId,
      senderId: this.localUserId
    };

    await this.sendToRecipients(content, recipientUserIds);
  }

  // ──── Receive + Decrypt ────

  /**
   * Fetch and decrypt queued envelopes for this device.
   * Returns decrypted PlaintextContent messages.
   */
  async fetchAndDecrypt(): Promise<PlaintextContent[]> {
    const envelopes = await firstValueFrom(this.api.fetchEnvelopes(this.localDeviceId));
    if (!envelopes || envelopes.length === 0) return [];

    const messages: PlaintextContent[] = [];
    const idsToAck: string[] = [];

    for (const env of envelopes) {
      try {
        const decrypted = await this.decryptEnvelope(env);
        if (decrypted) {
          messages.push(decrypted);
          // Cache decrypted message locally
          await this.keyStore.cacheMessage(env.id, decrypted);
        }
        idsToAck.push(env.id);
      } catch (err) {
        console.error('Failed to decrypt envelope:', env.id, err);
        idsToAck.push(env.id); // Ack even on failure to avoid re-processing
      }
    }

    // Acknowledge delivered envelopes
    if (idsToAck.length > 0) {
      await firstValueFrom(this.api.acknowledgeEnvelopes(this.localDeviceId, idsToAck));
    }

    // Check if we need to replenish pre-keys
    await this.checkAndReplenishPreKeys();

    return messages;
  }

  /**
   * Download and decrypt an attachment using its pointer metadata.
   */
  async downloadAndDecryptAttachment(pointer: AttachmentPointer): Promise<ArrayBuffer> {
    const ciphertext = await firstValueFrom(this.api.downloadAttachment(pointer.attachmentId));
    return this.attachmentCrypto.decryptAttachmentBlob(pointer, ciphertext);
  }

  /**
   * Download and decrypt a voice note.
   */
  async downloadAndDecryptVoice(pointer: VoicePointer): Promise<ArrayBuffer> {
    const ciphertext = await firstValueFrom(this.api.downloadAttachment(pointer.attachmentId));
    return this.attachmentCrypto.decryptAttachmentBlob(pointer, ciphertext);
  }

  // ──── Internal ────

  private async sendToRecipients(
    content: PlaintextContent,
    recipientUserIds: string[]
  ): Promise<void> {
    const plaintextJson = JSON.stringify(content);
    const envelopes: SubmitEnvelope[] = [];

    for (const userId of recipientUserIds) {
      // Get all devices for this user
      const deviceIds = await firstValueFrom(this.api.getUserDeviceIds(userId));

      for (const deviceId of deviceIds) {
        // Skip our own device
        if (userId === this.localUserId && deviceId === this.localDeviceId) continue;

        // Ensure session exists
        if (!(await this.signal.hasSession(userId, deviceId))) {
          const bundle = await firstValueFrom(this.api.fetchKeyBundle(userId, deviceId));
          if (bundle) {
            await this.signal.processPreKeyBundle(bundle);
          } else {
            console.warn(`No key bundle for ${userId}:${deviceId}, skipping`);
            continue;
          }
        }

        // Encrypt
        const encrypted = await this.signal.encrypt(userId, deviceId, plaintextJson);

        envelopes.push({
          destinationUserId: userId,
          destinationDeviceId: deviceId,
          type: encrypted.type as any,
          content: encrypted.body
        });
      }
    }

    if (envelopes.length > 0) {
      await firstValueFrom(this.api.submitEnvelopes(envelopes));
    }
  }

  private async decryptEnvelope(env: EnvelopeResponse): Promise<PlaintextContent | null> {
    if (!env.sourceUserId || env.sourceDeviceId === undefined) {
      console.warn('Envelope missing source address, skipping');
      return null;
    }

    const plaintext = await this.signal.decrypt(
      env.sourceUserId,
      env.sourceDeviceId,
      env.type,
      env.content
    );

    return JSON.parse(plaintext) as PlaintextContent;
  }

  private async checkAndReplenishPreKeys(): Promise<void> {
    try {
      const countResp = await firstValueFrom(this.api.getOtpkCount(this.localDeviceId));
      if (countResp.available < PREKEY_LOW_THRESHOLD) {
        const newKeys = await this.signal.generatePreKeys(
          this.nextPreKeyId,
          PREKEY_REPLENISH_COUNT
        );
        await firstValueFrom(this.api.replenishPreKeys(this.localDeviceId, {
          oneTimePreKeys: newKeys
        }));
        this.nextPreKeyId += PREKEY_REPLENISH_COUNT;
      }
    } catch (err) {
      console.error('Pre-key replenishment failed:', err);
    }
  }

  private startEnvelopePolling(): void {
    // Listen for SignalR push notifications
    this.signalR.onEnvelopeReady(() => {
      this.fetchAndDecrypt().catch(err =>
        console.error('Envelope fetch failed:', err)
      );
    });
  }

  // ──── Public Utilities ────

  /**
   * Get the safety number for verifying a contact's identity.
   */
  async getSafetyNumber(remoteUserId: string, remoteIdentityKey: string): Promise<string> {
    return this.signal.computeSafetyNumber(this.localUserId, remoteUserId, remoteIdentityKey);
  }

  /**
   * Lock the keystore (zero session key from memory).
   */
  lockKeyStore(): void {
    this.keyStore.lock();
  }

  /**
   * Wipe all local crypto material (panic button).
   */
  async wipeAll(): Promise<void> {
    this.savedCrypto.reset();
    await this.keyStore.wipe();
  }

  // ──── Saved Messages (Personal Vault) ────

  /**
   * Initialize the Saved Messages vault crypto.
   * Must be called after setup() completes.
   */
  async initSavedMessages(): Promise<void> {
    await this.savedCrypto.initialize();
  }

  /**
   * Encrypt and store a text message to Saved Messages.
   * Uses SavedRoomKey + HKDF chain (NOT Signal Protocol).
   */
  async sendSavedMessage(
    chatId: string,
    text: string,
    replyToId?: string
  ): Promise<{ envelope: SavedMessageEnvelope; content: PlaintextContent }> {
    const content: PlaintextContent = {
      body: text,
      timestamp: Date.now(),
      chatId,
      senderId: this.localUserId,
      replyToId
    };

    const envelope = await this.savedCrypto.encrypt(JSON.stringify(content), chatId);

    // Store envelope on server as an opaque blob (ciphertext-only)
    const envelopeBlob: SubmitEnvelope = {
      destinationUserId: this.localUserId,
      destinationDeviceId: this.localDeviceId,
      type: 2, // NormalMessage type
      content: btoa(JSON.stringify(envelope))
    };
    await firstValueFrom(this.api.submitEnvelopes([envelopeBlob]));

    return { envelope, content };
  }

  /**
   * Encrypt and store a file attachment to Saved Messages.
   */
  async sendSavedAttachment(
    chatId: string,
    file: File,
    text?: string
  ): Promise<{ envelope: SavedMessageEnvelope; content: PlaintextContent }> {
    const plaintext = await file.arrayBuffer();
    const { pointer, chunks } = await this.attachmentCrypto.encryptAttachment(
      plaintext, file.type, file.name
    );

    const initResp = await firstValueFrom(this.api.initiateUpload(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await firstValueFrom(this.api.uploadChunk(initResp.attachmentId, i, chunks[i]));
    }
    await firstValueFrom(this.api.completeUpload(initResp.attachmentId));

    const attachmentPointer: AttachmentPointer = {
      attachmentId: initResp.attachmentId,
      ...pointer,
      chunkSize: pointer.chunkSize ?? 65536,
      streamHeader: pointer.streamHeader
    };

    const content: PlaintextContent = {
      body: text,
      attachments: [attachmentPointer],
      timestamp: Date.now(),
      chatId,
      senderId: this.localUserId
    };

    const envelope = await this.savedCrypto.encrypt(JSON.stringify(content), chatId);
    const envelopeBlob: SubmitEnvelope = {
      destinationUserId: this.localUserId,
      destinationDeviceId: this.localDeviceId,
      type: 2,
      content: btoa(JSON.stringify(envelope))
    };
    await firstValueFrom(this.api.submitEnvelopes([envelopeBlob]));

    return { envelope, content };
  }

  /**
   * Encrypt and store a voice note to Saved Messages.
   */
  async sendSavedVoiceNote(
    chatId: string,
    audioBlob: Blob,
    duration: number,
    waveform: number[],
    codec: string
  ): Promise<{ envelope: SavedMessageEnvelope; content: PlaintextContent }> {
    const { pointer, chunks } = await this.attachmentCrypto.encryptVoiceNote(
      audioBlob, duration, waveform, codec
    );

    const initResp = await firstValueFrom(this.api.initiateUpload(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await firstValueFrom(this.api.uploadChunk(initResp.attachmentId, i, chunks[i]));
    }
    await firstValueFrom(this.api.completeUpload(initResp.attachmentId));

    const voicePointer: VoicePointer = {
      attachmentId: initResp.attachmentId,
      ...pointer
    };

    const content: PlaintextContent = {
      voiceNote: voicePointer,
      timestamp: Date.now(),
      chatId,
      senderId: this.localUserId
    };

    const envelope = await this.savedCrypto.encrypt(JSON.stringify(content), chatId);
    const envelopeBlob: SubmitEnvelope = {
      destinationUserId: this.localUserId,
      destinationDeviceId: this.localDeviceId,
      type: 2,
      content: btoa(JSON.stringify(envelope))
    };
    await firstValueFrom(this.api.submitEnvelopes([envelopeBlob]));

    return { envelope, content };
  }

  /**
   * Decrypt a Saved Messages envelope.
   */
  async decryptSavedEnvelope(envelopeB64: string, chatId: string): Promise<PlaintextContent> {
    const envelope: SavedMessageEnvelope = JSON.parse(atob(envelopeB64));
    const plaintext = await this.savedCrypto.decrypt(envelope, chatId);
    return JSON.parse(plaintext) as PlaintextContent;
  }

  /**
   * Lock the saved vault (zero keys from memory).
   */
  lockSavedVault(): void {
    this.savedCrypto.reset();
  }
}
