import { Component, signal, inject, afterNextRender, ElementRef, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

declare var gsap: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-page" #authPage>
      <!-- Animated background circles -->
      <div class="auth-bg-circle auth-bg-circle-1"></div>
      <div class="auth-bg-circle auth-bg-circle-2"></div>
      <div class="auth-bg-circle auth-bg-circle-3"></div>

      <div class="auth-card" #authCard>
        <!-- Logo -->
        <div class="auth-logo-wrap" #logoWrap>
          <div class="auth-logo">
            <i class="ph-fill ph-chat-circle-dots"></i>
          </div>
          <h1 class="auth-title">AzadiyanChat</h1>
          <p class="auth-subtitle">ورود به حساب کاربری</p>
        </div>

        <!-- Error -->
        @if (error()) {
          <div class="auth-error">
            <i class="ph ph-warning-circle"></i>
            {{ error() }}
          </div>
        }

        <!-- Form -->
        <form (ngSubmit)="onLogin()" class="auth-form" #authForm>
          <div class="auth-input-group">
            <i class="ph ph-envelope auth-input-icon"></i>
            <input type="email" [(ngModel)]="email" name="email" required
              class="auth-input"
              placeholder="ایمیل" />
          </div>

          <div class="auth-input-group">
            <i class="ph ph-lock-simple auth-input-icon"></i>
            <input [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="password" name="password" required
              class="auth-input"
              placeholder="رمز عبور" />
            <button type="button" class="auth-eye-btn" (click)="togglePassword()">
              <i [class]="showPassword() ? 'ph ph-eye-slash' : 'ph ph-eye'"></i>
            </button>
          </div>

          <button type="submit" [disabled]="isLoading()" class="auth-submit-btn">
            @if (isLoading()) {
              <span class="auth-spinner"></span>
              <span>در حال ورود...</span>
            } @else {
              <i class="ph ph-sign-in" style="font-size: 1.15rem;"></i>
              <span>ورود</span>
            }
          </button>
        </form>

        <div class="auth-footer">
          <span>حساب کاربری ندارید؟</span>
          <a routerLink="/auth/register" class="auth-link">ثبت‌نام کنید</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-page {
      min-height: 100vh; min-height: 100dvh;
      display: flex; align-items: center; justify-content: center;
      background: var(--tg-bg);
      position: relative; overflow: hidden;
      padding: 1rem;
    }
    .auth-bg-circle {
      position: absolute; border-radius: 50%; opacity: .18; filter: blur(80px); pointer-events: none;
    }
    .auth-bg-circle-1 {
      width: 420px; height: 420px;
      background: var(--tg-primary);
      top: -10%; left: -8%;
      animation: authFloat1 8s ease-in-out infinite;
    }
    .auth-bg-circle-2 {
      width: 320px; height: 320px;
      background: #a855f7;
      bottom: -6%; right: -5%;
      animation: authFloat2 10s ease-in-out infinite;
    }
    .auth-bg-circle-3 {
      width: 200px; height: 200px;
      background: #06b6d4;
      top: 50%; left: 60%;
      animation: authFloat3 12s ease-in-out infinite;
    }
    @keyframes authFloat1 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(30px,40px) scale(1.08); } }
    @keyframes authFloat2 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-25px,-30px) scale(1.1); } }
    @keyframes authFloat3 { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(20px,-25px) scale(1.06); } }

    .auth-card {
      width: 100%; max-width: 400px;
      background: var(--tg-surface);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 1.5rem;
      padding: 2.5rem 2rem 2rem;
      box-shadow: 0 24px 64px rgba(0,0,0,.18), 0 0 0 1px rgba(255,255,255,.04) inset;
      backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
      position: relative; z-index: 1;
      opacity: 0;
    }
    .auth-logo-wrap {
      display: flex; flex-direction: column; align-items: center; gap: .5rem; margin-bottom: 2rem;
    }
    .auth-logo {
      width: 72px; height: 72px; border-radius: 1.25rem; transform: rotate(12deg);
      background: linear-gradient(135deg, var(--tg-primary), #a855f7);
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 12px 32px rgba(var(--tg-primary-rgb, 59,130,246), .35);
      transition: transform .3s ease;
    }
    .auth-logo:hover { transform: rotate(0deg) scale(1.05); }
    .auth-logo i { font-size: 2.2rem; color: #fff; transform: rotate(-12deg); }
    .auth-title {
      font-size: 1.65rem; font-weight: 800; color: var(--tg-text); margin-top: .5rem;
      letter-spacing: -.02em;
    }
    .auth-subtitle {
      font-size: .875rem; color: var(--tg-muted); font-weight: 400;
    }
    .auth-error {
      display: flex; align-items: center; gap: .5rem;
      background: rgba(239, 68, 68, .1); color: #ef4444;
      border-radius: .75rem; padding: .75rem 1rem;
      font-size: .8rem; margin-bottom: 1rem;
      border: 1px solid rgba(239,68,68,.15);
      animation: authShake .4s ease;
    }
    @keyframes authShake {
      0%,100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
    .auth-form { display: flex; flex-direction: column; gap: 1rem; }
    .auth-input-group {
      position: relative; display: flex; align-items: center;
    }
    .auth-input-icon {
      position: absolute; left: 1rem; font-size: 1.15rem; color: var(--tg-muted);
      transition: color .2s;
      pointer-events: none;
    }
    .auth-input {
      width: 100%; padding: .85rem 1rem .85rem 2.75rem;
      background: var(--tg-bg); color: var(--tg-text);
      border: 2px solid transparent; border-radius: 1rem;
      font-size: .9rem; outline: none;
      transition: border-color .25s, box-shadow .25s, background .25s;
    }
    .auth-input:focus {
      border-color: var(--tg-primary);
      box-shadow: 0 0 0 3px rgba(var(--tg-primary-rgb, 59,130,246), .12);
    }
    .auth-input:focus + .auth-input-icon,
    .auth-input-group:focus-within .auth-input-icon { color: var(--tg-primary); }
    .auth-input::placeholder { color: var(--tg-muted); opacity: .65; }
    .auth-eye-btn {
      position: absolute; right: .75rem; background: none; border: none;
      color: var(--tg-muted); font-size: 1.15rem; cursor: pointer;
      padding: .25rem; border-radius: .5rem;
      transition: color .2s, background .2s;
    }
    .auth-eye-btn:hover { color: var(--tg-text); background: rgba(255,255,255,.06); }
    .auth-submit-btn {
      display: flex; align-items: center; justify-content: center; gap: .5rem;
      width: 100%; padding: .9rem; border: none; border-radius: 1rem;
      background: linear-gradient(135deg, var(--tg-primary), #a855f7);
      color: #fff; font-size: .95rem; font-weight: 600;
      cursor: pointer; position: relative; overflow: hidden;
      transition: transform .15s, box-shadow .25s, opacity .2s;
      box-shadow: 0 6px 20px rgba(var(--tg-primary-rgb, 59,130,246), .35);
    }
    .auth-submit-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 28px rgba(var(--tg-primary-rgb, 59,130,246), .45);
    }
    .auth-submit-btn:active:not(:disabled) { transform: scale(.98); }
    .auth-submit-btn:disabled { opacity: .65; cursor: not-allowed; }
    .auth-spinner {
      width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,.3);
      border-top-color: #fff; border-radius: 50%;
      animation: authSpin .6s linear infinite;
    }
    @keyframes authSpin { to { transform: rotate(360deg); } }
    .auth-footer {
      margin-top: 1.75rem; text-align: center;
      font-size: .85rem; color: var(--tg-muted);
      display: flex; align-items: center; justify-content: center; gap: .4rem;
    }
    .auth-link {
      color: var(--tg-primary); font-weight: 600; text-decoration: none;
      transition: opacity .2s;
    }
    .auth-link:hover { opacity: .8; }

    @media (max-width: 440px) {
      .auth-card { padding: 2rem 1.25rem 1.5rem; }
    }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  authCard = viewChild<ElementRef>('authCard');
  logoWrap = viewChild<ElementRef>('logoWrap');
  authForm = viewChild<ElementRef>('authForm');

  email = '';
  password = '';
  error = signal('');
  isLoading = signal(false);
  showPassword = signal(false);

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  constructor() {
    afterNextRender(() => {
      setTimeout(() => this.animateEntrance(), 50);
    });
  }

  private animateEntrance() {
    if (typeof gsap === 'undefined') {
      const card = this.authCard()?.nativeElement;
      if (card) card.style.opacity = '1';
      return;
    }
    const card = this.authCard()?.nativeElement;
    const logo = this.logoWrap()?.nativeElement;
    const form = this.authForm()?.nativeElement;
    if (!card) return;

    const tl = gsap.timeline();
    tl.fromTo(card, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' });
    if (logo) tl.fromTo(logo, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '-=0.2');
    if (form) {
      const inputs = form.querySelectorAll('.auth-input-group, .auth-submit-btn');
      if (inputs.length) tl.fromTo(inputs, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: 'power2.out' }, '-=0.15');
    }
  }

  async onLogin() {
    this.error.set('');
    this.isLoading.set(true);

    const result = await this.auth.login(this.email, this.password);
    this.isLoading.set(false);

    if (result.success) {
      this.router.navigate(['/']);
    } else {
      this.error.set(result.error || 'ورود ناموفق بود');
    }
  }
}
