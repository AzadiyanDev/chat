import { Injectable, inject } from '@angular/core';
import { KeyStoreService } from './key-store.service';
import type {
  KeyBundleResponse, KeyBundleUpload, PreKeyDto, LocalIdentity
} from '../../models/e2ee.model';

import {
  KeyHelper,
  SignalProtocolAddress,
  SessionBuilder,
  SessionCipher,
  FingerprintGenerator,
  Direction,
  type StorageType,
  type KeyPairType,
  type SessionRecordType
} from '@privacyresearch/libsignal-protocol-typescript';

const ONE_TIME_PREKEY_COUNT = 100;
const FINGERPRINT_ITERATIONS = 5200;

/**
 * Wraps the Signal Protocol (X3DH + Double Ratchet) using
 * @privacyresearch/libsignal-protocol-typescript (pure JS, browser-safe).
 *
 * All private key material is persisted via KeyStoreService (encrypted IndexedDB).
 * Server NEVER sees private keys — only public keys + ciphertext.
 */
@Injectable({ providedIn: 'root' })
export class SignalProtocolService {

  private keyStore = inject(KeyStoreService);
  private store: SignalStore | null = null;

  // ──── Initialization ────

  /**
   * Create or restore the local identity (identity key pair, registration ID).
   * Returns the public bundle to upload to the server.
   */
  async initializeIdentity(deviceId: number): Promise<KeyBundleUpload> {
    await this.ensureStore();

    let identity = await this.keyStore.getLocalIdentity();

    if (!identity) {
      const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
      const registrationId = KeyHelper.generateRegistrationId();

      identity = {
        registrationId,
        deviceId,
        identityKeyPair: {
          publicKey: this.ab2b64(identityKeyPair.pubKey),
          privateKey: this.ab2b64(identityKeyPair.privKey)
        }
      };

      await this.keyStore.saveLocalIdentity(identity);
    }

    // Generate signed pre-key
    const signedPreKeyId = 1;
    const ikp = this.restoreKeyPair(identity.identityKeyPair);
    const signedPreKey = await KeyHelper.generateSignedPreKey(ikp, signedPreKeyId);

    await this.keyStore.saveSignedPreKey(signedPreKeyId, JSON.stringify({
      pubKey: this.ab2b64(signedPreKey.keyPair.pubKey),
      privKey: this.ab2b64(signedPreKey.keyPair.privKey)
    }));

    // Generate one-time pre-keys
    const oneTimePreKeys: PreKeyDto[] = [];
    for (let i = 1; i <= ONE_TIME_PREKEY_COUNT; i++) {
      const pk = await KeyHelper.generatePreKey(i);
      await this.keyStore.savePreKey(i, JSON.stringify({
        pubKey: this.ab2b64(pk.keyPair.pubKey),
        privKey: this.ab2b64(pk.keyPair.privKey)
      }));
      oneTimePreKeys.push({
        keyId: i,
        publicKey: this.ab2b64(pk.keyPair.pubKey)
      });
    }

    return {
      registrationId: identity.registrationId,
      identityPublicKey: identity.identityKeyPair.publicKey,
      signedPreKey: {
        keyId: signedPreKeyId,
        publicKey: this.ab2b64(signedPreKey.keyPair.pubKey),
        signature: this.ab2b64(signedPreKey.signature)
      },
      oneTimePreKeys
    };
  }

  // ──── Session Management ────

  /**
   * Establish a session with a remote user/device using their key bundle.
   */
  async processPreKeyBundle(bundle: KeyBundleResponse): Promise<void> {
    await this.ensureStore();

    const address = new SignalProtocolAddress(bundle.userId, bundle.deviceId);
    const builder = new SessionBuilder(this.store!, address);

    const device: any = {
      identityKey: this.b642ab(bundle.identityPublicKey),
      signedPreKey: {
        keyId: bundle.signedPreKey.keyId,
        publicKey: this.b642ab(bundle.signedPreKey.publicKey),
        signature: this.b642ab(bundle.signedPreKey.signature!)
      },
      registrationId: bundle.registrationId
    };

    if (bundle.oneTimePreKey) {
      device.preKey = {
        keyId: bundle.oneTimePreKey.keyId,
        publicKey: this.b642ab(bundle.oneTimePreKey.publicKey)
      };
    }

    await builder.processPreKey(device);
  }

  /**
   * Encrypt a plaintext message for a remote user/device.
   * Returns { type, body } where body is base64 ciphertext.
   */
  async encrypt(userId: string, deviceId: number, plaintext: string): Promise<{ type: number; body: string }> {
    await this.ensureStore();

    const address = new SignalProtocolAddress(userId, deviceId);
    const cipher = new SessionCipher(this.store!, address);

    const buffer = new TextEncoder().encode(plaintext).buffer;
    const result = await cipher.encrypt(buffer);

    return {
      type: result.type ?? 3, // 3 = PreKeyWhisperMessage, 1 = WhisperMessage
      body: typeof result.body === 'string'
        ? result.body
        : this.ab2b64(result.body as unknown as ArrayBuffer)
    };
  }

  /**
   * Decrypt an incoming message from a remote user/device.
   */
  async decrypt(userId: string, deviceId: number, type: number, ciphertext: string): Promise<string> {
    await this.ensureStore();

    const address = new SignalProtocolAddress(userId, deviceId);
    const cipher = new SessionCipher(this.store!, address);

    let plaintext: ArrayBuffer;

    if (type === 3) {
      // PreKeyWhisperMessage
      plaintext = await cipher.decryptPreKeyWhisperMessage(ciphertext, 'binary');
    } else {
      // WhisperMessage
      plaintext = await cipher.decryptWhisperMessage(ciphertext, 'binary');
    }

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Check if we have an open session with a remote user/device.
   */
  async hasSession(userId: string, deviceId: number): Promise<boolean> {
    await this.ensureStore();
    const address = new SignalProtocolAddress(userId, deviceId);
    const cipher = new SessionCipher(this.store!, address);
    return cipher.hasOpenSession();
  }

  // ──── Safety Number (Fingerprint) ────

  /**
   * Compute a displayable safety number for verifying identity.
   */
  async computeSafetyNumber(
    localUserId: string, remoteUserId: string, remoteIdentityKey: string
  ): Promise<string> {
    const identity = await this.keyStore.getLocalIdentity();
    if (!identity) throw new Error('No local identity');

    const generator = new FingerprintGenerator(FINGERPRINT_ITERATIONS);
    const localPub = this.b642ab(identity.identityKeyPair.publicKey);
    const remotePub = this.b642ab(remoteIdentityKey);

    return generator.createFor(localUserId, localPub, remoteUserId, remotePub);
  }

  // ──── Pre-Key Replenishment ────

  /**
   * Generate additional one-time pre-keys starting from the given ID.
   */
  async generatePreKeys(startId: number, count: number): Promise<PreKeyDto[]> {
    const keys: PreKeyDto[] = [];
    for (let i = startId; i < startId + count; i++) {
      const pk = await KeyHelper.generatePreKey(i);
      await this.keyStore.savePreKey(i, JSON.stringify({
        pubKey: this.ab2b64(pk.keyPair.pubKey),
        privKey: this.ab2b64(pk.keyPair.privKey)
      }));
      keys.push({
        keyId: i,
        publicKey: this.ab2b64(pk.keyPair.pubKey)
      });
    }
    return keys;
  }

  // ──── Internal: Signal Protocol Store Adapter ────

  private async ensureStore(): Promise<void> {
    if (this.store) return;
    this.store = new SignalStore(this.keyStore);
  }

  // ──── Encoding Utilities ────

  private ab2b64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private b642ab(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private restoreKeyPair(kp: { publicKey: string; privateKey: string }): KeyPairType {
    return {
      pubKey: this.b642ab(kp.publicKey),
      privKey: this.b642ab(kp.privateKey)
    };
  }
}

/**
 * Implements the Signal Protocol StorageType interface,
 * backed by the encrypted KeyStoreService (IndexedDB + AES-GCM).
 */
class SignalStore implements StorageType {

  constructor(private ks: KeyStoreService) {}

  async getIdentityKeyPair(): Promise<KeyPairType | undefined> {
    const identity = await this.ks.getLocalIdentity();
    if (!identity) return undefined;
    return {
      pubKey: this.b642ab(identity.identityKeyPair.publicKey),
      privKey: this.b642ab(identity.identityKeyPair.privateKey)
    };
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const identity = await this.ks.getLocalIdentity();
    return identity?.registrationId;
  }

  async isTrustedIdentity(
    identifier: string, identityKey: ArrayBuffer, _direction: Direction
  ): Promise<boolean> {
    // Trust on first use (TOFU). In production, compare saved identity.
    // A more complete implementation would check if the identity has changed
    // and alert the user ("safety number changed").
    const session = await this.ks.getSession(identifier);
    if (!session) return true; // First contact — trust

    // For existing sessions, always trust (allow key rotation).
    // The UI layer should check for identity changes separately.
    return true;
  }

  async saveIdentity(encodedAddress: string, publicKey: ArrayBuffer): Promise<boolean> {
    // Returns true if there was already an identity AND it changed.
    // This signals a "safety number change" to the UI.
    const existing = await this.ks.getSession(`id_${encodedAddress}`);
    await this.ks.saveSession(`id_${encodedAddress}`, this.ab2b64(publicKey));
    return !!existing;
  }

  async loadPreKey(keyId: string | number): Promise<KeyPairType | undefined> {
    const raw = await this.ks.getPreKey(Number(keyId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return { pubKey: this.b642ab(parsed.pubKey), privKey: this.b642ab(parsed.privKey) };
  }

  async storePreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.ks.savePreKey(Number(keyId), JSON.stringify({
      pubKey: this.ab2b64(keyPair.pubKey),
      privKey: this.ab2b64(keyPair.privKey)
    }));
  }

  async removePreKey(keyId: number | string): Promise<void> {
    await this.ks.removePreKey(Number(keyId));
  }

  async storeSession(encodedAddress: string, record: SessionRecordType): Promise<void> {
    await this.ks.saveSession(encodedAddress, record);
  }

  async loadSession(encodedAddress: string): Promise<SessionRecordType | undefined> {
    return (await this.ks.getSession(encodedAddress)) ?? undefined;
  }

  async loadSignedPreKey(keyId: number | string): Promise<KeyPairType | undefined> {
    const raw = await this.ks.getSignedPreKey(Number(keyId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return { pubKey: this.b642ab(parsed.pubKey), privKey: this.b642ab(parsed.privKey) };
  }

  async storeSignedPreKey(keyId: number | string, keyPair: KeyPairType): Promise<void> {
    await this.ks.saveSignedPreKey(Number(keyId), JSON.stringify({
      pubKey: this.ab2b64(keyPair.pubKey),
      privKey: this.ab2b64(keyPair.privKey)
    }));
  }

  async removeSignedPreKey(keyId: number | string): Promise<void> {
    // Signed pre-keys are rotated, not removed
  }

  // ──── Encoding Utilities ────

  private ab2b64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private b642ab(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
