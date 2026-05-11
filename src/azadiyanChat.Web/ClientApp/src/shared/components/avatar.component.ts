import { Component, input, computed, signal } from '@angular/core';

@Component({
  selector: 'app-avatar',
  standalone: true,
  template: `
    <div 
      class="relative rounded-full flex items-center justify-center overflow-visible shrink-0 transition-transform active:scale-90"
      [class]="sizeClasses()"
    >
      <!-- Avatar Circle -->
      <div class="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-blue-400 to-telegram-primary text-white font-medium flex items-center justify-center relative">
        @if (src() && !imgError()) {
          <img 
            [src]="src()" 
            class="w-full h-full object-cover transition-opacity duration-300"
            [class.opacity-0]="!imgLoaded()"
            [class.opacity-100]="imgLoaded()"
            alt="Avatar" 
            (load)="onLoad()"
            (error)="onError()"
          />
          @if (!imgLoaded()) {
            <div class="absolute inset-0 shimmer-bg bg-gray-300 dark:bg-gray-700 rounded-full"></div>
          }
        } @else {
          <span [class]="textSizeClass()">{{ initials() }}</span>
        }
      </div>
      
      <!-- Online Dot -->
      @if (isOnline()) {
        <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-telegram-surface rounded-full z-10"></div>
      }
    </div>
  `
})
export class AvatarComponent {
  src = input<string | undefined>();
  name = input<string>('');
  size = input<'xs' | 'sm' | 'md' | 'lg'>('md');
  isOnline = input<boolean>(false);

  imgLoaded = signal(false);
  imgError = signal(false);

  sizeClasses = computed(() => {
    switch (this.size()) {
      case 'xs': return 'w-8 h-8';
      case 'sm': return 'w-10 h-10';
      case 'lg': return 'w-16 h-16';
      default: return 'w-12 h-12';
    }
  });

  textSizeClass = computed(() => {
    switch (this.size()) {
      case 'xs': return 'text-xs';
      case 'sm': return 'text-sm';
      case 'lg': return 'text-xl';
      default: return 'text-base';
    }
  });

  initials = computed(() => {
    const n = this.name();
    if (!n) return '?';
    const parts = n.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.substring(0, 2).toUpperCase();
  });

  onLoad() { this.imgLoaded.set(true); }
  onError() { this.imgError.set(true); }
}