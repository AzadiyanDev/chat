import { Injectable } from '@angular/core';
import type { AttachmentPointer, VoicePointer } from '../../models/e2ee.model';

const CHUNK_SIZE = 65536; // 64 KiB

/**
 * Handles chunk-based encryption/decryption of attachments and voice notes
 * using libsodium's secretstream_xchacha20poly1305 (AEAD stream cipher).
 *
 * Flow:
 *   Encrypt: plaintext file → random key → secretstream → ciphertext chunks + header
 *   Decrypt: key + header + ciphertext chunks → secretstream → plaintext
 *
 * The key + header + digest are included inside the E2EE message envelope,
 * so the server stores ONLY ciphertext — no keys.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentCryptoService {

  private sodium: any = null;

  private async getSodium(): Promise<any> {
    if (!this.sodium) {
      const sodiumModule = await import('libsodium-wrappers-sumo');
      await sodiumModule.ready;
      this.sodium = sodiumModule;
    }
    return this.sodium;
  }

  // ──── Encrypt Attachment ────

  /**
   * Encrypt a file/blob into ciphertext chunks.
   * Returns AttachmentPointer metadata (for inclusion in E2EE envelope)
   * and an array of ciphertext chunks (for uploading to server).
   */
  async encryptAttachment(
    plaintext: ArrayBuffer,
    contentType: string,
    fileName?: string
  ): Promise<{ pointer: Omit<AttachmentPointer, 'attachmentId'>; chunks: Uint8Array[] }> {
    const sodium = await this.getSodium();

    // Generate random content key
    const contentKey = sodium.randombytes_buf(
      sodium.crypto_secretstream_xchacha20poly1305_KEYBYTES
    );

    // Init push stream
    const pushState = sodium.crypto_secretstream_xchacha20poly1305_init_push(contentKey);
    const header: Uint8Array = pushState.header;

    const plaintextBytes = new Uint8Array(plaintext);
    const totalChunks = Math.ceil(plaintextBytes.length / CHUNK_SIZE) || 1;
    const chunks: Uint8Array[] = [];
    let ciphertextSize = 0;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, plaintextBytes.length);
      const chunk = plaintextBytes.slice(start, end);

      const isLast = i === totalChunks - 1;
      const tag = isLast
        ? sodium.crypto_secretstream_xchacha20poly1305_TAG_FINAL
        : sodium.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE;

      const encrypted = sodium.crypto_secretstream_xchacha20poly1305_push(
        pushState.state, chunk, null, tag
      );

      chunks.push(encrypted);
      ciphertextSize += encrypted.length;
    }

    // Compute SHA-256 digest of ciphertext
    const digest = await this.sha256(chunks);

    return {
      pointer: {
        contentKey: this.ab2b64(contentKey),
        contentType,
        fileName,
        size: plaintextBytes.length,
        ciphertextSize,
        digest: this.ab2b64(digest),
        chunkSize: CHUNK_SIZE,
        streamHeader: this.ab2b64(header)
      },
      chunks
    };
  }

  // ──── Decrypt Attachment ────

  /**
   * Decrypt ciphertext chunks back into plaintext using the pointer metadata.
   */
  async decryptAttachment(
    pointer: AttachmentPointer | VoicePointer,
    ciphertextChunks: Uint8Array[]
  ): Promise<ArrayBuffer> {
    const sodium = await this.getSodium();

    const contentKey = this.b642u8(pointer.contentKey);
    const header = this.b642u8(pointer.streamHeader);

    const pullState = sodium.crypto_secretstream_xchacha20poly1305_init_pull(header, contentKey);

    const plaintextParts: Uint8Array[] = [];

    for (const chunk of ciphertextChunks) {
      const result = sodium.crypto_secretstream_xchacha20poly1305_pull(pullState, chunk, null);
      if (!result) {
        throw new Error('Decryption failed: corrupted or tampered chunk');
      }
      plaintextParts.push(result.message);
    }

    // Concatenate
    const totalLength = plaintextParts.reduce((sum, p) => sum + p.length, 0);
    const plaintext = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of plaintextParts) {
      plaintext.set(part, offset);
      offset += part.length;
    }

    return plaintext.buffer;
  }

  /**
   * Decrypt a full ciphertext blob (single ArrayBuffer containing all chunks).
   * Splits into CHUNK_SIZE + ABYTES boundaries and decrypts.
   */
  async decryptAttachmentBlob(
    pointer: AttachmentPointer | VoicePointer,
    ciphertext: ArrayBuffer
  ): Promise<ArrayBuffer> {
    const sodium = await this.getSodium();
    const ABYTES = sodium.crypto_secretstream_xchacha20poly1305_ABYTES;
    const encChunkSize = CHUNK_SIZE + ABYTES;

    const data = new Uint8Array(ciphertext);
    const chunks: Uint8Array[] = [];

    for (let offset = 0; offset < data.length; offset += encChunkSize) {
      const end = Math.min(offset + encChunkSize, data.length);
      chunks.push(data.slice(offset, end));
    }

    return this.decryptAttachment(pointer, chunks);
  }

  // ──── Encrypt Voice Note ────

  /**
   * Encrypt a voice note blob and return VoicePointer + ciphertext chunks.
   */
  async encryptVoiceNote(
    audioBlob: Blob,
    duration: number,
    waveform: number[],
    codec: string
  ): Promise<{ pointer: Omit<VoicePointer, 'attachmentId'>; chunks: Uint8Array[] }> {
    const plaintext = await audioBlob.arrayBuffer();
    const result = await this.encryptAttachment(plaintext, codec);

    return {
      pointer: {
        contentKey: result.pointer.contentKey,
        duration,
        waveform,
        streamHeader: result.pointer.streamHeader,
        digest: result.pointer.digest,
        codec
      },
      chunks: result.chunks
    };
  }

  // ──── Encrypt Thumbnail ────

  /**
   * Encrypt a small thumbnail using same key (for inline display).
   * Uses simple libsodium secretbox (not streaming — thumbnail is tiny).
   */
  async encryptThumbnail(thumbnailData: ArrayBuffer, contentKey: string): Promise<string> {
    const sodium = await this.getSodium();
    const key = this.b642u8(contentKey).slice(0, sodium.crypto_secretbox_KEYBYTES);
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const cipher = sodium.crypto_secretbox_easy(
      new Uint8Array(thumbnailData), nonce, key
    );

    // Prepend nonce to ciphertext
    const combined = new Uint8Array(nonce.length + cipher.length);
    combined.set(nonce, 0);
    combined.set(cipher, nonce.length);

    return this.ab2b64(combined);
  }

  /**
   * Decrypt an encrypted thumbnail.
   */
  async decryptThumbnail(encryptedB64: string, contentKey: string): Promise<ArrayBuffer> {
    const sodium = await this.getSodium();
    const key = this.b642u8(contentKey).slice(0, sodium.crypto_secretbox_KEYBYTES);
    const combined = this.b642u8(encryptedB64);

    const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
    const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);

    const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    if (!plaintext) throw new Error('Thumbnail decryption failed');

    return plaintext.buffer;
  }

  // ──── Verify Digest ────

  /**
   * Verify ciphertext integrity using SHA-256 digest.
   */
  async verifyDigest(ciphertextChunks: Uint8Array[], expectedDigestB64: string): Promise<boolean> {
    const actual = await this.sha256(ciphertextChunks);
    const expected = this.b642u8(expectedDigestB64);

    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }
    return true;
  }

  // ──── Private Utilities ────

  private async sha256(chunks: Uint8Array[]): Promise<Uint8Array> {
    // Concatenate all chunks for hashing
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const all = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) {
      all.set(c, off);
      off += c.length;
    }

    const digest = await crypto.subtle.digest('SHA-256', all);
    return new Uint8Array(digest);
  }

  private ab2b64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private b642u8(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
