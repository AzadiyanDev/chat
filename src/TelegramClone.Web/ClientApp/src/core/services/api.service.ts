import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  // ──── Messages ────
  getMessages(chatId: string, limit = 50, before?: string): Observable<any[]> {
    let url = `${this.baseUrl}/chats/${chatId}/messages?limit=${limit}`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return this.http.get<any[]>(url);
  }

  sendMessage(chatId: string, data: { text?: string; replyToId?: string }): Observable<any> {
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
}
