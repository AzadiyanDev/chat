// ──── E2EE Types & Interfaces ────
// These types represent the client-side crypto structures.
// Private keys NEVER leave the client. Server only sees public keys + ciphertext.

export interface DeviceRegistration {
  id: string;
  userId: string;
  deviceId: number;
  deviceName?: string;
  createdAt: number;
  lastActiveAt: number;
  isActive: boolean;
}

export interface PreKeyDto {
  keyId: number;
  publicKey: string;  // base64
  signature?: string; // base64
}

export interface KeyBundleUpload {
  registrationId: number;
  identityPublicKey: string;  // base64
  signedPreKey: PreKeyDto;
  kyberPreKey?: PreKeyDto;
  oneTimePreKeys: PreKeyDto[];
}

export interface KeyBundleResponse {
  userId: string;
  deviceId: number;
  registrationId: number;
  identityPublicKey: string;  // base64
  signedPreKey: PreKeyDto;
  kyberPreKey?: PreKeyDto;
  oneTimePreKey?: PreKeyDto;
}

// ──── Message Envelope (E2EE transport) ────

export enum EnvelopeType {
  PreKeyMessage = 1,
  NormalMessage = 2,
  SenderKeyMessage = 3
}

export interface SubmitEnvelope {
  destinationUserId: string;
  destinationDeviceId: number;
  type: EnvelopeType;
  content: string;  // base64 ciphertext
}

export interface EnvelopeResponse {
  id: string;
  sourceUserId?: string;
  sourceDeviceId?: number;
  type: EnvelopeType;
  content: string;  // base64 ciphertext
  serverTimestamp: number;
}

// ──── Plaintext Content (inside E2EE envelope, after decryption) ────

export interface PlaintextContent {
  body?: string;
  attachments?: AttachmentPointer[];
  voiceNote?: VoicePointer;
  reaction?: { emoji: string; targetMessageId: string };
  receipt?: { type: 'delivery' | 'read'; targetMessageIds: string[] };
  replyToId?: string;
  timestamp: number;
  chatId: string;
  senderId: string;
}

export interface AttachmentPointer {
  attachmentId: string;
  contentKey: string;     // base64 (32 bytes) — attachment encryption key
  contentType: string;    // MIME type
  fileName?: string;
  size: number;           // plaintext size
  ciphertextSize: number;
  digest: string;         // base64 SHA-256 of ciphertext
  chunkSize: number;      // default 65536
  streamHeader: string;   // base64 (24 bytes) — libsodium secretstream header
  thumbnailCipher?: string; // base64 encrypted thumbnail
  width?: number;
  height?: number;
}

export interface VoicePointer {
  attachmentId: string;
  contentKey: string;     // base64
  duration: number;       // ms
  waveform: number[];     // 50 samples, normalized 0-1
  streamHeader: string;   // base64
  digest: string;         // base64 SHA-256
  codec: string;          // e.g., "audio/webm;codecs=opus"
}

// ──── KeyStore Types ────

export interface EncryptedKeyStore {
  version: number;
  salt: string;         // base64, for Argon2id
  kdfParams: KdfParams;
  encryptedData: string; // base64 AES-256-GCM ciphertext
  iv: string;           // base64
}

export interface KdfParams {
  timeCost: number;
  memoryCost: number;   // in KiB
  parallelism: number;
  hashLength: number;
}

export interface LocalIdentity {
  registrationId: number;
  deviceId: number;
  identityKeyPair: {
    publicKey: string;   // base64
    privateKey: string;  // base64
  };
}

// ──── Attachment Upload/Download ────

export interface InitiateUploadResponse {
  attachmentId: string;
  uploadUrl: string;
}

export interface CompleteUploadResponse {
  attachmentId: string;
  ciphertextSize: number;
  isComplete: boolean;
}
