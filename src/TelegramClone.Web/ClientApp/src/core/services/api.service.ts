import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import type {
  KeyBundleUpload, KeyBundleResponse, SubmitEnvelope,
  EnvelopeResponse, InitiateUploadResponse, CompleteUploadResponse, PreKeyDto
} from '../../models/e2ee.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = '/api';

  // ──── Auth ────
  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/login`, { email, password });
  }

  register(email: string, password: string, name: string, username?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/register`, { email, password, name, username });
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/logout`, {});
  }

  getMe(): Observable<any> {
    return this.http.get(`${this.baseUrl}/auth/me`);
  }

  // ──── Chats ────
  getChats(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/chats`);
  }

  getChat(chatId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/chats/${chatId}`);
  }

  createChat(data: { type: string; name?: string; description?: string; participantIds: string[] }): Observable<any> {
    return this.http.post(`${this.baseUrl}/chats`, data);
  }

  pinChat(chatId: string, isPinned: boolean): Observable<any> {
    return this.http.put(`${this.baseUrl}/chats/${chatId}/pin`, { isPinned });
  }

  searchChats(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/chats/search?q=${encodeURIComponent(query)}`);
  }

  getSavedMessagesChat(): Observable<any> {
    return this.http.get(`${this.baseUrl}/chats/saved`);
  }

  // ──── Messages ────
  getMessages(chatId: string, limit = 50, before?: string): Observable<any[]> {
    let url = `${this.baseUrl}/chats/${chatId}/messages?limit=${limit}`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return this.http.get<any[]>(url);
  }

  sendMessage(chatId: string, data: {
    text?: string;
    replyToId?: string;
    attachments?: Array<{
      type: 'Image' | 'Video' | 'Audio' | 'Document';
      url: string;
      name?: string;
      size?: number;
      thumbnailUrl?: string;
    }>;
  }): Observable<any> {
    return this.http.post(`${this.baseUrl}/chats/${chatId}/messages`, data);
  }

  deleteMessage(chatId: string, messageId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/chats/${chatId}/messages/${messageId}`);
  }

  addReaction(chatId: string, messageId: string, emoji: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/chats/${chatId}/messages/${messageId}/reactions`, { emoji });
  }

  removeReaction(chatId: string, messageId: string, emoji: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/chats/${chatId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  }

  forwardMessage(chatId: string, messageId: string, targetChatId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/chats/${chatId}/messages/${messageId}/forward`, { targetChatId });
  }

  // ──── Users ────
  searchUsers(query: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/users/search?q=${encodeURIComponent(query)}`);
  }

  getUser(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/users/${userId}`);
  }

  updateProfile(data: { name: string; username?: string; bio?: string; avatarUrl?: string }): Observable<any> {
    return this.http.put(`${this.baseUrl}/users/profile`, data);
  }

  // ──── Files ────
  uploadVoice(file: Blob, fileName: string): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file, fileName);
    return this.http.post<{ url: string }>(`${this.baseUrl}/files/voice`, formData);
  }

  uploadAvatar(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>(`${this.baseUrl}/files/avatar`, formData);
  }

  uploadAttachment(file: File): Observable<{ url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<{ url: string }>(`${this.baseUrl}/files/attachment`, formData);
  }

  // ──── E2EE: Devices ────
  registerDevice(deviceName: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/devices/register`, { deviceName });
  }

  getDevices(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/devices`);
  }

  revokeDevice(deviceId: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/devices/${deviceId}`);
  }

  // ──── E2EE: Key Bundles ────
  uploadKeyBundle(deviceId: number, bundle: KeyBundleUpload): Observable<any> {
    return this.http.post(`${this.baseUrl}/keys/bundle/${deviceId}`, bundle);
  }

  fetchKeyBundle(userId: string, deviceId?: number): Observable<KeyBundleResponse> {
    const url = deviceId !== undefined
      ? `${this.baseUrl}/keys/bundle/${userId}/${deviceId}`
      : `${this.baseUrl}/keys/bundle/${userId}`;
    return this.http.get<KeyBundleResponse>(url);
  }

  getUserDeviceIds(userId: string): Observable<number[]> {
    return this.http.get<any[]>(`${this.baseUrl}/keys/bundle/${userId}`).pipe(
      map((bundles: any) => {
        if (Array.isArray(bundles)) return bundles.map((b: any) => b.deviceId);
        return bundles?.deviceId ? [bundles.deviceId] : [];
      })
    );
  }

  replenishPreKeys(deviceId: number, data: { oneTimePreKeys: PreKeyDto[] }): Observable<any> {
    return this.http.post(`${this.baseUrl}/keys/replenish/${deviceId}`, data);
  }

  getOtpkCount(deviceId: number): Observable<{ available: number }> {
    return this.http.get<{ available: number }>(`${this.baseUrl}/keys/otpk-count/${deviceId}`);
  }

  // ──── E2EE: Envelopes ────
  submitEnvelopes(envelopes: SubmitEnvelope[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/envelopes`, { envelopes });
  }

  fetchEnvelopes(deviceId: number): Observable<EnvelopeResponse[]> {
    return this.http.get<EnvelopeResponse[]>(`${this.baseUrl}/envelopes/${deviceId}`);
  }

  acknowledgeEnvelopes(deviceId: number, envelopeIds: string[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/envelopes/ack/${deviceId}`, { envelopeIds });
  }

  // ──── E2EE: Encrypted Attachments ────
  initiateUpload(totalChunks: number): Observable<InitiateUploadResponse> {
    return this.http.post<InitiateUploadResponse>(`${this.baseUrl}/attachments/upload`, { totalChunks });
  }

  uploadChunk(attachmentId: string, chunkIndex: number, data: Uint8Array): Observable<any> {
    return this.http.put(`${this.baseUrl}/attachments/${attachmentId}/chunks/${chunkIndex}`, data.buffer, {
      headers: new HttpHeaders({ 'Content-Type': 'application/octet-stream' })
    });
  }

  completeUpload(attachmentId: string): Observable<CompleteUploadResponse> {
    return this.http.post<CompleteUploadResponse>(`${this.baseUrl}/attachments/${attachmentId}/complete`, {});
  }

  downloadAttachment(attachmentId: string): Observable<ArrayBuffer> {
    return this.http.get(`${this.baseUrl}/attachments/${attachmentId}`, {
      responseType: 'arraybuffer'
    });
  }
}
