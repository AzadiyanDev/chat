 import { Injectable } from '@angular/core';
import type { EncryptedKeyStore, KdfParams, LocalIdentity } from '../../models/e2ee.model';

// Default Argon2id parameters (OWASP recommended)
const DEFAULT_KDF_PARAMS: KdfParams = {
  timeCost: 3,
  memoryCost: 65536,  // 64 MiB
  parallelism: 4,
  hashLength: 32
};

const DB_NAME = 'TelegramCloneKeys';
const DB_VERSION = 2;

const STORES = {
  identity: 'identity',
  sessions: 'sessions',
  prekeys: 'prekeys',
  signedPrekeys: 'signedPrekeys',
  senderKeys: 'senderKeys',
  metadata: 'metadata',
  messageCache: 'messageCache',
  savedVault: 'savedVault'
} as const;

/**
 * Manages encrypted storage of all E2EE key material in IndexedDB.
 *
 * Architecture:
 * - User passphrase → Argon2id → MasterKey
 * - MasterKey imported as non-extractable WebCrypto AES-GCM key
 * - All key material AES-256-GCM encrypted before IndexedDB storage
 * - SessionKey held in memory, zeroed on lock/timeout
 *
 * NOTE: Private keys NEVER leave this service unencrypted.
 */
@Injectable({ providedIn: 'root' })
export class KeyStoreService {

  private db: IDBDatabase | null = null;
  private sessionKey: CryptoKey | null = null;
  private lockTimeout: any = null;
  private readonly LOCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes

  // ──── Initialization ────

  async initialize(): Promise<void> {
    this.db = await this.openDatabase();
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db: IDBDatabase = event.target.result;
        for (const storeName of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName);
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ──── Passphrase / MasterKey ────

  /**
   * Derive MasterKey from passphrase using Argon2id.
   * MasterKey is imported as non-extractable AES-GCM key.
   */
  async unlock(passphrase: string): Promise<boolean> {
    try {
      // @ts-expect-error argon2-browser has no type declarations; ambient .d.ts provided separately
      const argon2: typeof import('argon2-browser') = await import('argon2-browser');

      let salt: Uint8Array;
      const existingSalt = await this.getRaw(STORES.metadata, 'masterKeySalt');

      if (existingSalt) {
        salt = new Uint8Array(this.base64ToArrayBuffer(existingSalt));
      } else {
        // First time — generate salt
        salt = crypto.getRandomValues(new Uint8Array(32));
        await this.putRaw(STORES.metadata, 'masterKeySalt', this.arrayBufferToBase64(salt));
        await this.putRaw(STORES.metadata, 'kdfParams', JSON.stringify(DEFAULT_KDF_PARAMS));
      }

      const paramsStr = await this.getRaw(STORES.metadata, 'kdfParams');
      const params: KdfParams = paramsStr ? JSON.parse(paramsStr) : DEFAULT_KDF_PARAMS;

      const result = await argon2.hash({
        pass: passphrase,
        salt: salt,
        time: params.timeCost,
        mem: params.memoryCost,
        parallelism: params.parallelism,
        hashLen: params.hashLength,
        type: argon2.ArgonType.Argon2id
      });

      // Import as non-extractable AES-GCM key
      this.sessionKey = await crypto.subtle.importKey(
        'raw',
        result.hash,
        { name: 'AES-GCM' },
        false, // non-extractable
        ['encrypt', 'decrypt']
      );

      // Zero the raw hash buffer (best-effort)
      result.hash.fill(0);

      this.resetLockTimer();
      return true;

    } catch (err) {
      console.error('KeyStore unlock failed:', err);
      return false;
    }
  }

  /**
   * Check if a passphrase has been set (KeyStore initialized).
   */
  async isInitialized(): Promise<boolean> {
    const salt = await this.getRaw(STORES.metadata, 'masterKeySalt');
    return salt !== null && salt !== undefined;
  }

  get isUnlocked(): boolean {
    return this.sessionKey !== null;
  }

  // ──── Lock / Wipe ────

  lock(): void {
    this.sessionKey = null;
    if (this.lockTimeout) {
      clearTimeout(this.lockTimeout);
      this.lockTimeout = null;
    }
  }

  private resetLockTimer(): void {
    if (this.lockTimeout) clearTimeout(this.lockTimeout);
    this.lockTimeout = setTimeout(() => this.lock(), this.LOCK_AFTER_MS);
  }

  /**
   * Activity heartbeat — resets the auto-lock timer.
   */
  touch(): void {
    if (this.sessionKey) this.resetLockTimer();
  }

  /**
   * Panic wipe — delete ALL key material and caches.
   */
  async wipe(): Promise<void> {
    this.lock();

    // Delete databases
    indexedDB.deleteDatabase(DB_NAME);
    indexedDB.deleteDatabase('TelegramCloneVoices');

    // Clear all caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    // Clear other storage
    localStorage.clear();
    sessionStorage.clear();

    this.db = null;
  }

  // ──── Identity Key Management ────

  async saveLocalIdentity(identity: LocalIdentity): Promise<void> {
    await this.putEncrypted(STORES.identity, 'local', identity);
  }

  async getLocalIdentity(): Promise<LocalIdentity | null> {
    return await this.getEncrypted<LocalIdentity>(STORES.identity, 'local');
  }

  // ──── Session Store (Signal Protocol sessions) ────

  async saveSession(address: string, record: string): Promise<void> {
    await this.putEncrypted(STORES.sessions, address, record);
  }

  async getSession(address: string): Promise<string | null> {
    return await this.getEncrypted<string>(STORES.sessions, address);
  }

  async removeSession(address: string): Promise<void> {
    await this.deleteKey(STORES.sessions, address);
  }

  async getAllSessionAddresses(): Promise<string[]> {
    return await this.getAllKeys(STORES.sessions);
  }

  // ──── Pre-Key Store ────

  async savePreKey(keyId: number, record: string): Promise<void> {
    await this.putEncrypted(STORES.prekeys, `pk_${keyId}`, record);
  }

  async getPreKey(keyId: number): Promise<string | null> {
    return await this.getEncrypted<string>(STORES.prekeys, `pk_${keyId}`);
  }

  async removePreKey(keyId: number): Promise<void> {
    await this.deleteKey(STORES.prekeys, `pk_${keyId}`);
  }

  // ──── Signed Pre-Key Store ────

  async saveSignedPreKey(keyId: number, record: string): Promise<void> {
    await this.putEncrypted(STORES.signedPrekeys, `spk_${keyId}`, record);
  }

  async getSignedPreKey(keyId: number): Promise<string | null> {
    return await this.getEncrypted<string>(STORES.signedPrekeys, `spk_${keyId}`);
  }

  // ──── Message Cache (encrypted local cache of decrypted messages) ────

  async cacheMessage(messageId: string, plaintext: any): Promise<void> {
    await this.putEncrypted(STORES.messageCache, messageId, plaintext);
  }

  async getCachedMessage(messageId: string): Promise<any | null> {
    return await this.getEncrypted(STORES.messageCache, messageId);
  }

  // ──── Saved Vault Key Store ────

  /**
   * Store the SavedRoomKey + chain state, encrypted with MasterKey.
   */
  async putSavedVaultKey(data: { roomKey: string; chainKey: string; counter: number }): Promise<void> {
    await this.putEncrypted(STORES.savedVault, 'vaultState', data);
  }

  /**
   * Retrieve the SavedRoomKey + chain state.
   */
  async getSavedVaultKey(): Promise<{ roomKey: string; chainKey: string; counter: number } | null> {
    return await this.getEncrypted(STORES.savedVault, 'vaultState');
  }

  /**
   * Store a chain key snapshot indexed by counter for random-access decryption.
   */
  async putChainSnapshot(counter: number, chainKey: string): Promise<void> {
    await this.putEncrypted(STORES.savedVault, `chain_${counter}`, chainKey);
  }

  /**
   * Retrieve a chain key snapshot by counter.
   */
  async getChainSnapshot(counter: number): Promise<string | null> {
    return await this.getEncrypted<string>(STORES.savedVault, `chain_${counter}`);
  }

  // ──── Core Encrypted Storage Primitives ────

  private async putEncrypted<T>(storeName: string, key: string, value: T): Promise<void> {
    if (!this.sessionKey) throw new Error('KeyStore is locked');
    this.resetLockTimer();

    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.sessionKey,
      plaintext
    );

    const record = {
      iv: this.arrayBufferToBase64(iv),
      ct: this.arrayBufferToBase64(ciphertext)
    };

    await this.putRaw(storeName, key, JSON.stringify(record));
  }

  private async getEncrypted<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.sessionKey) throw new Error('KeyStore is locked');
    this.resetLockTimer();

    const raw = await this.getRaw(storeName, key);
    if (!raw) return null;

    try {
      const record = JSON.parse(raw);
      const iv = new Uint8Array(this.base64ToArrayBuffer(record.iv));
      const ciphertext = this.base64ToArrayBuffer(record.ct);

      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.sessionKey!,
        ciphertext
      );

      return JSON.parse(new TextDecoder().decode(plaintext));
    } catch {
      // Decryption failed (wrong passphrase or corrupted data)
      return null;
    }
  }

  // ──── Raw IndexedDB Operations (unencrypted metadata only) ────

  private putRaw(storeName: string, key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialized')); return; }
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private getRaw(storeName: string, key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialized')); return; }
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private deleteKey(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialized')); return; }
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private getAllKeys(storeName: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('DB not initialized')); return; }
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result as any[]).map(String));
      req.onerror = () => reject(req.error);
    });
  }

  // ──── Encoding Utilities ────

  private arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
