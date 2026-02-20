import { Component, inject, afterNextRender } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="h-screen w-screen overflow-hidden relative bg-white dark:bg-telegram-surface">
      <router-outlet></router-outlet>
    </div>
  `
})
export class AppComponent {
  private themeService = inject(ThemeService);

  constructor() {
    afterNextRender(() => {
      this.themeService.init();
    });
  }
}