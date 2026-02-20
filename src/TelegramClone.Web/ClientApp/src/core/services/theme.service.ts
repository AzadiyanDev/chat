import { Injectable, signal, inject } from '@angular/core';
import { AnimationService } from './animation.service';

export type ThemeName = 'classic' | 'night' | 'midnight' | 'rose';

export interface ThemeInfo {
  id: ThemeName;
  label: string;
  icon: string;
  isDark: boolean;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private animation = inject(AnimationService);
  private isThemeTransitioning = false;

  static readonly themes: ThemeInfo[] = [
    { id: 'classic', label: 'Classic', icon: 'ph-sun', isDark: false },
    { id: 'night', label: 'Night', icon: 'ph-moon', isDark: true },
    { id: 'midnight', label: 'Midnight', icon: 'ph-moon-stars', isDark: true },
    { id: 'rose', label: 'Rose Gold', icon: 'ph-flower-tulip', isDark: true },
  ];

  currentTheme = signal<ThemeName>(this.loadSavedTheme());
  isDarkMode = signal<boolean>(this.getThemeInfo(this.loadSavedTheme()).isDark);

  get themes() { return ThemeService.themes; }

  getThemeInfo(id: ThemeName): ThemeInfo {
    return ThemeService.themes.find(t => t.id === id) || ThemeService.themes[1];
  }

  private loadSavedTheme(): ThemeName {
    try {
      const saved = localStorage.getItem('telegram-theme') as ThemeName;
      if (saved && ThemeService.themes.some(t => t.id === saved)) return saved;
    } catch {}
    return 'night';
  }

  setTheme(theme: ThemeName, event?: MouseEvent) {
    if (theme === this.currentTheme()) return;
    if (this.isThemeTransitioning) return;

    const x = event?.clientX ?? window.innerWidth / 2;
    const y = event?.clientY ?? 50;
    this.isThemeTransitioning = true;

    this.animation.morphThemeTransition(x, y, () => {
      this.applyTheme(theme);
    }, () => {
      this.isThemeTransitioning = false;
    });
  }

  toggleTheme(event?: MouseEvent) {
    const themes: ThemeName[] = ['classic', 'night', 'midnight', 'rose'];
    const currentIdx = themes.indexOf(this.currentTheme());
    const nextTheme = themes[(currentIdx + 1) % themes.length];
    this.setTheme(nextTheme, event);
  }

  private applyTheme(theme: ThemeName) {
    const info = this.getThemeInfo(theme);
    const html = document.documentElement;

    html.setAttribute('data-theme', theme);

    if (info.isDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }

    this.currentTheme.set(theme);
    this.isDarkMode.set(info.isDark);

    try {
      localStorage.setItem('telegram-theme', theme);
    } catch {}
  }

  // Initialize theme on app start (call from constructor or app init)
  init() {
    this.applyTheme(this.currentTheme());
  }
}
