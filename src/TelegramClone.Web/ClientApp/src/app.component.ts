import { Component, inject, afterNextRender } from '@angular/core';
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

  constructor() {
    afterNextRender(async () => {
      this.themeService.init();
      await this.auth.initialize();

      // Start SignalR if authenticated
      if (this.auth.isAuthenticated()) {
        await this.signalR.start();
      }
    });
  }
}
