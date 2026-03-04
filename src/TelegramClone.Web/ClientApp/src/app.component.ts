import { Component, inject, afterNextRender, effect, DestroyRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';
import { AuthService } from './core/services/auth.service';
import { SignalRService } from './core/services/signalr.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="fixed inset-0 overflow-hidden relative bg-white dark:bg-telegram-surface">
      @if (auth.isLoading()) {
        <div class="h-full w-full flex items-center justify-center" style="background: var(--tg-bg);">
          <div class="text-center">
            <div class="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                 style="background: var(--tg-primary);">
              <i class="ph ph-telegram-logo text-3xl text-white"></i>
            </div>
            <div class="w-8 h-8 border-3 border-t-transparent rounded-full animate-spin mx-auto"
                 style="border-color: var(--tg-primary); border-top-color: transparent;"></div>
          </div>
        </div>
      } @else {
        <router-outlet></router-outlet>
      }
    </div>
  `
})
export class AppComponent {
  private themeService = inject(ThemeService);
  auth = inject(AuthService);
  private signalR = inject(SignalRService);
  private destroyRef = inject(DestroyRef);
  private isBrowser = false;

  constructor() {
    afterNextRender(async () => {
      this.isBrowser = true;
      this.themeService.init();
      await this.auth.initialize();
    });

    // Reactive SignalR lifecycle: start/stop based on auth state
    effect(async () => {
      const authenticated = this.auth.isAuthenticated();
      if (!this.isBrowser) return;

      if (authenticated) {
        await this.signalR.start();
      } else {
        await this.signalR.stop();
      }
    });
  }
}
