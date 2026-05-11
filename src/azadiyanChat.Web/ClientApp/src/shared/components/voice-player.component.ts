import { Component, input, signal, ElementRef, viewChild, OnDestroy } from '@angular/core';

declare var gsap: any;

@Component({
  selector: 'app-voice-player',
  standalone: true,
  template: `
    <div class="flex items-center gap-3 h-12 min-w-[220px] max-w-full">
      <!-- Play/Pause Button with SVG morph -->
      <button 
        (click)="togglePlay($event)"
        class="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all active:scale-90 hover:shadow-md"
        [class]="isMine() ? 'bg-white/90 text-telegram-primary' : 'bg-telegram-primary text-white'"
        #playBtn
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          @if (isPlaying()) {
            <rect x="5" y="4" width="5" height="16" rx="1.5"/>
            <rect x="14" y="4" width="5" height="16" rx="1.5"/>
          } @else {
            <path d="M6 4.832c0-1.429 1.554-2.318 2.794-1.598l12.255 7.168c1.218.712 1.218 2.484 0 3.196L8.794 20.766C7.554 21.486 6 20.597 6 19.168V4.832z"/>
          }
        </svg>
      </button>
      
      <div class="flex flex-col flex-1 justify-center relative h-full">
        <!-- Animated SVG Waveform -->
        <svg 
          class="w-full h-8 cursor-pointer" 
          preserveAspectRatio="none" 
          (click)="scrub($event)"
          #svgScrubber
        >
          <!-- Background bars -->
          @for (val of waveform(); track $index) {
            <rect
              [attr.x]="$index * (100 / waveform().length) + '%'"
              [attr.y]="(100 - (val * 100)) / 2 + '%'"
              [attr.width]="(100 / waveform().length) * 0.6 + '%'"
              [attr.height]="Math.max(val * 100, 6) + '%'"
              [attr.rx]="1.5"
              [attr.fill]="unplayedColor()"
            ></rect>
          }
          <!-- Played bars (clipped) -->
          <clipPath id="waveform-clip-{{instanceId}}">
            <rect x="0" y="0" [attr.width]="progressPercentage() + '%'" height="100%"/>
          </clipPath>
          <g [attr.clip-path]="'url(#waveform-clip-' + instanceId + ')'">
            @for (val of waveform(); track $index) {
              <rect
                [attr.x]="$index * (100 / waveform().length) + '%'"
                [attr.y]="(100 - (val * 100)) / 2 + '%'"
                [attr.width]="(100 / waveform().length) * 0.6 + '%'"
                [attr.height]="Math.max(val * 100, 6) + '%'"
                [attr.rx]="1.5"
                [attr.fill]="playedColor()"
              ></rect>
            }
          </g>
          <!-- Progress indicator dot -->
          <circle 
            [attr.cx]="progressPercentage() + '%'" 
            cy="50%" 
            r="4"
            [attr.fill]="playedColor()"
            class="transition-all"
            [class.opacity-100]="isPlaying()"
            [class.opacity-0]="!isPlaying()"
          />
        </svg>
        
        <!-- Time + Speed -->
        <div 
          class="flex justify-between items-center text-[10px] font-medium leading-none"
          [class]="isMine() ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'"
        >
          <span class="tabular-nums">{{ formatTime(isPlaying() ? currentTime() : durationMs() / 1000) }}</span>
          <button 
            (click)="cycleSpeed($event)" 
            class="px-1.5 py-0.5 rounded-full text-[9px] font-bold transition-all hover:scale-105 active:scale-95"
            [class]="isMine() ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700'"
            #speedBtn
          >
            {{ playbackSpeed() }}x
          </button>
        </div>
      </div>
      
      <audio 
        #audioElement 
        [src]="audioUrl()" 
        (ended)="onEnded()"
        (timeupdate)="onTimeUpdate($event)"
        class="hidden"
      ></audio>
    </div>
  `
})
export class VoicePlayerComponent implements OnDestroy {
  audioUrl = input.required<string>();
  durationMs = input.required<number>();
  waveform = input<number[]>([]);
  isMine = input<boolean>(false);
  
  audioRef = viewChild<ElementRef<HTMLAudioElement>>('audioElement');
  playBtn = viewChild<ElementRef>('playBtn');
  speedBtn = viewChild<ElementRef>('speedBtn');
  
  isPlaying = signal(false);
  currentTime = signal(0);
  progressPercentage = signal(0);
  playbackSpeed = signal(1);
  
  instanceId = Math.random().toString(36).substring(2, 8);
  Math = Math;

  private speeds = [1, 1.5, 2, 0.5];

  playedColor() {
    return this.isMine() ? '#ffffff' : '#3390ec';
  }
  
  unplayedColor() {
    return this.isMine() ? 'rgba(255,255,255,0.3)' : 'rgba(150,150,150,0.3)';
  }

  togglePlay(event: Event) {
    event.stopPropagation();
    const audio = this.audioRef()?.nativeElement;
    if (!audio) return;

    if (this.isPlaying()) {
      audio.pause();
      this.isPlaying.set(false);
    } else {
      audio.playbackRate = this.playbackSpeed();
      audio.play().catch(e => console.error('Audio play failed', e));
      this.isPlaying.set(true);
    }

    // Animate button
    const btn = this.playBtn()?.nativeElement;
    if (btn && typeof gsap !== 'undefined') {
      gsap.fromTo(btn, { scale: 0.8 }, { scale: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.4)' });
    }
  }

  cycleSpeed(event: Event) {
    event.stopPropagation();
    const currentIdx = this.speeds.indexOf(this.playbackSpeed());
    const nextIdx = (currentIdx + 1) % this.speeds.length;
    this.playbackSpeed.set(this.speeds[nextIdx]);
    
    const audio = this.audioRef()?.nativeElement;
    if (audio) audio.playbackRate = this.playbackSpeed();

    const btn = this.speedBtn()?.nativeElement;
    if (btn && typeof gsap !== 'undefined') {
      gsap.fromTo(btn, { scale: 0.7, rotation: -10 }, { scale: 1, rotation: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
    }
  }

  scrub(event: MouseEvent) {
    event.stopPropagation();
    const el = event.currentTarget as SVGElement;
    const rect = el.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    
    const audio = this.audioRef()?.nativeElement;
    const totalSeconds = this.durationMs() / 1000;
    if (audio && totalSeconds > 0) {
      audio.currentTime = pos * totalSeconds;
      this.currentTime.set(audio.currentTime);
      this.progressPercentage.set(pos * 100);
    }
  }

  onTimeUpdate(event: Event) {
    const audio = event.target as HTMLAudioElement;
    this.currentTime.set(audio.currentTime);
    const totalSeconds = this.durationMs() / 1000;
    if (totalSeconds > 0) {
      this.progressPercentage.set((audio.currentTime / totalSeconds) * 100);
    }
  }

  onEnded() {
    this.isPlaying.set(false);
    this.currentTime.set(0);
    this.progressPercentage.set(0);
    const audio = this.audioRef()?.nativeElement;
    if (audio) audio.currentTime = 0;
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
  
  ngOnDestroy() {
    const audio = this.audioRef()?.nativeElement;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }
}