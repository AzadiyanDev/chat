import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { User } from '../../models/chat.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  currentUser = signal<User | null>(null);
  isAuthenticated = signal(false);
  isLoading = signal(true);

  /** Try to restore session on app start */
  async initialize(): Promise<void> {
    this.isLoading.set(true);
    try {
      const user = await this.api.getMe().toPromise();
      if (user) {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
      }
    } catch {
      // Not authenticated
      this.currentUser.set(null);
      this.isAuthenticated.set(false);
    } finally {
      this.isLoading.set(false);
    }
  }

  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result: any = await this.api.login(email, password).toPromise();
      if (result.succeeded && result.user) {
        this.currentUser.set(result.user);
        this.isAuthenticated.set(true);
        return { success: true };
      }
      return { success: false, error: result.error || 'Login failed' };
    } catch (err: any) {
      return { success: false, error: err.error?.error || 'Login failed' };
    }
  }

  async register(email: string, password: string, name: string, username?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const result: any = await this.api.register(email, password, name, username).toPromise();
      if (result.succeeded && result.user) {
        this.currentUser.set(result.user);
        this.isAuthenticated.set(true);
        return { success: true };
      }
      return { success: false, error: result.error || 'Registration failed' };
    } catch (err: any) {
      return { success: false, error: err.error?.error || 'Registration failed' };
    }
  }

  async logout(): Promise<void> {
    try {
      await this.api.logout().toPromise();
    } catch { }
    this.currentUser.set(null);
    this.isAuthenticated.set(false);
    this.router.navigate(['/auth/login']);
  }

  async updateProfile(data: { name: string; username?: string; bio?: string; avatarUrl?: string }): Promise<User | null> {
    try {
      const user = await this.api.updateProfile(data).toPromise();
      if (user) {
        this.currentUser.set(user);
      }
      return user;
    } catch {
      return null;
    }
  }
}
