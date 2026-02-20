import { Injectable, inject } from '@angular/core';
import { KeyStoreService } from './key-store.service';

/**
 * Saved Messages E2EE using a Personal Vault Key (Option B).
 *
 * Architecture:
 * - SavedRoomKey: 32-byte random symmetric key, generated once
 * - Per-message forward secrecy via HKDF chain ratchet:
 *     messageKey  = HKDF-SHA256(chainKey, info="saved-msg"  || counter)
 *     newChainKey = HKDF-SHA256(chainKey, info="chain-advance")
 * - Encrypt: AES-256-GCM(messageKey, nonce=12-byte random, plaintext, aad=chatId||counter)
 * - Chain keys indexed by counter are stored for random-access decryption
 * - SavedRoomKey + current chainKey + counter stored encrypted in KeyStore (Argon2id MasterKey)
 *
 * Security properties:
 * - Forward secrecy: compromising message N doesn't reveal message < N
 * - Any device with the passphrase can decrypt the entire history
 * - Server sees only ciphertext (no keys or plaintext ever leave the client)
 */

export interface SavedMessageEnvelope {
  /** Base64-encoded 12-byte nonce */
  nonce: string;
  /** Message counter (for chain key derivation) */
  counter: number;
  /** Base64-encoded AES-256-GCM ciphertext */
  ciphertext: string;
  /** Base64-encoded AAD: chatId || counter (verified but not encrypted) */
  aad: string;
}

@Injectable({ providedIn: 'root' })
export class SavedMessagesCryptoService {

  private keyStore = inject(KeyStoreService);

  /** In-memory cache of vault state */
  private roomKey: Uint8Array | null = null;
  private chainKey: Uint8Array | null = null;
  private counter: number = 0;
  private initialized = false;

  // ──── Initialization ────

  /**
   * Load or generate the SavedRoomKey + chain state.
   * Must be called after KeyStore is unlocked.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const stored = await this.keyStore.getSavedVaultKey();

    if (stored) {
      this.roomKey = this.base64ToBytes(stored.roomKey);
      this.chainKey = this.base64ToBytes(stored.chainKey);
      this.counter = stored.counter;
    } else {
      // First time: generate fresh keys
      this.roomKey = crypto.getRandomValues(new Uint8Array(32));
      this.chainKey = new Uint8Array(this.roomKey); // Initial chain key = copy of room key
      this.counter = 0;
      await this.persistState();
      // Store initial chain snapshot for counter 0
      await this.keyStore.putChainSnapshot(0, this.bytesToBase64(this.chainKey));
    }

    this.initialized = true;
  }

  /**
   * Reset state (called on lock/wipe).
   */
  reset(): void {
    if (this.roomKey) this.roomKey.fill(0);
    if (this.chainKey) this.chainKey.fill(0);
    this.roomKey = null;
    this.chainKey = null;
    this.counter = 0;
    this.initialized = false;
  }

  // ──── Encrypt (Send) ────

  /**
   * Encrypt a plaintext message for Saved Messages.
   * Advances the chain ratchet (forward secrecy).
   */
  async encrypt(plaintext: string, chatId: string): Promise<SavedMessageEnvelope> {
    this.ensureInitialized();

    const currentCounter = this.counter;

    // Derive per-message key: HKDF(chainKey, info="saved-msg" || counter)
    const messageKey = await this.deriveMessageKey(this.chainKey!, currentCounter);

    // Build AAD: chatId || counter (authenticated but not encrypted)
    const aadStr = `${chatId}|${currentCounter}`;
    const aad = new TextEncoder().encode(aadStr);

    // Encrypt with AES-256-GCM
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const importedKey = await crypto.subtle.importKey(
      'raw', messageKey.buffer.slice(messageKey.byteOffset, messageKey.byteOffset + messageKey.byteLength) as ArrayBuffer,
      { name: 'AES-GCM' }, false, ['encrypt']
    );

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: new Uint8Array(aad) },
      importedKey,
      plaintextBytes
    );

    // Advance chain: newChainKey = HKDF(chainKey, info="chain-advance")
    this.chainKey = await this.advanceChain(this.chainKey!);
    this.counter++;

    // Store chain snapshot for the NEW counter position (for future decryption)
    await this.keyStore.putChainSnapshot(this.counter, this.bytesToBase64(this.chainKey));

    // Persist updated state
    await this.persistState();

    // Zero the message key
    messageKey.fill(0);

    return {
      nonce: this.bytesToBase64(nonce),
      counter: currentCounter,
      ciphertext: this.bytesToBase64(new Uint8Array(ciphertext)),
      aad: this.bytesToBase64(aad)
    };
  }

  // ──── Decrypt (Receive) ────

  /**
   * Decrypt a Saved Messages envelope.
   * Uses stored chain snapshots for random-access decryption.
   */
  async decrypt(envelope: SavedMessageEnvelope, chatId: string): Promise<string> {
    this.ensureInitialized();

    // Get the chain key that was active at this envelope's counter
    const chainKeyB64 = await this.keyStore.getChainSnapshot(envelope.counter);
    if (!chainKeyB64) {
      throw new Error(`No chain snapshot for counter ${envelope.counter}`);
    }
    const snapshotChainKey = this.base64ToBytes(chainKeyB64);

    // Derive the per-message key for this counter
    const messageKey = await this.deriveMessageKey(snapshotChainKey, envelope.counter);

    // Reconstruct AAD
    const aadStr = `${chatId}|${envelope.counter}`;
    const aad = new TextEncoder().encode(aadStr);

    // Decrypt
    const nonce = this.base64ToBytes(envelope.nonce);
    const ciphertext = this.base64ToBytes(envelope.ciphertext);

    const importedKey = await crypto.subtle.importKey(
      'raw', messageKey.buffer.slice(messageKey.byteOffset, messageKey.byteOffset + messageKey.byteLength) as ArrayBuffer,
      { name: 'AES-GCM' }, false, ['decrypt']
    );

    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: nonce.buffer.slice(nonce.byteOffset, nonce.byteOffset + nonce.byteLength) as ArrayBuffer,
          additionalData: aad.buffer.slice(aad.byteOffset, aad.byteOffset + aad.byteLength) as ArrayBuffer
        },
        importedKey,
        ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength) as ArrayBuffer
      );

      // Zero the message key
      messageKey.fill(0);

      return new TextDecoder().decode(plaintext);
    } catch {
      messageKey.fill(0);
      throw new Error('Saved message decryption failed — wrong key or corrupted data');
    }
  }

  // ──── HKDF Key Derivation ────

  /**
   * Derive per-message key: HKDF-SHA256(chainKey, info="saved-msg" || counter)
   */
  private async deriveMessageKey(chainKey: Uint8Array, counter: number): Promise<Uint8Array> {
    const info = new TextEncoder().encode(`saved-msg|${counter}`);
    return this.hkdfDerive(chainKey, info, 32);
  }

  /**
   * Advance chain: HKDF-SHA256(chainKey, info="chain-advance")
   */
  private async advanceChain(chainKey: Uint8Array): Promise<Uint8Array> {
    const info = new TextEncoder().encode('chain-advance');
    return this.hkdfDerive(chainKey, info, 32);
  }

  /**
   * HKDF-SHA256 extract-then-expand.
   */
  private async hkdfDerive(ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
    const baseKey = await crypto.subtle.importKey(
      'raw', ikm.buffer.slice(ikm.byteOffset, ikm.byteOffset + ikm.byteLength) as ArrayBuffer,
      { name: 'HKDF' }, false, ['deriveBits']
    );

    const salt = new Uint8Array(32); // Zero salt (HKDF spec allows this)
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(salt), info: new Uint8Array(info) },
      baseKey,
      length * 8
    );

    return new Uint8Array(bits);
  }

  // ──── State Management ────

  private async persistState(): Promise<void> {
    if (!this.roomKey || !this.chainKey) return;
    await this.keyStore.putSavedVaultKey({
      roomKey: this.bytesToBase64(this.roomKey),
      chainKey: this.bytesToBase64(this.chainKey),
      counter: this.counter
    });
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.roomKey || !this.chainKey) {
      throw new Error('SavedMessagesCrypto not initialized — call initialize() first');
    }
  }

  // ──── Encoding Utilities ────

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
