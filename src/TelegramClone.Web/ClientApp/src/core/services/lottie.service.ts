import { Injectable } from '@angular/core';

declare var lottie: any;

interface LottieInstance {
  animation: any;
  container: HTMLElement;
}

@Injectable({ providedIn: 'root' })
export class LottieService {
  private cache = new Map<string, any>();
  private instances = new Map<string, LottieInstance>();

  private get isAvailable(): boolean {
    return typeof lottie !== 'undefined';
  }

  play(container: HTMLElement, animationData: any, options: {
    loop?: boolean;
    autoplay?: boolean;
    id?: string;
    speed?: number;
  } = {}): any {
    if (!this.isAvailable) return null;
    
    const id = options.id || 'lottie_' + Math.random().toString(36).substr(2, 6);
    
    // Clean previous if same container
    this.stopById(id);
    container.innerHTML = '';

    const anim = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: options.loop ?? true,
      autoplay: options.autoplay ?? true,
      animationData,
    });

    if (options.speed) anim.setSpeed(options.speed);

    this.instances.set(id, { animation: anim, container });
    return anim;
  }

  playOnce(container: HTMLElement, animationData: any, onComplete?: () => void): any {
    if (!this.isAvailable) {
      onComplete?.();
      return null;
    }
    
    container.innerHTML = '';
    const anim = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData,
    });

    anim.addEventListener('complete', () => {
      anim.destroy();
      onComplete?.();
    });

    return anim;
  }

  stop(container: HTMLElement) {
    for (const [id, inst] of this.instances) {
      if (inst.container === container) {
        inst.animation.destroy();
        this.instances.delete(id);
        break;
      }
    }
  }

  stopById(id: string) {
    const inst = this.instances.get(id);
    if (inst) {
      inst.animation.destroy();
      this.instances.delete(id);
    }
  }
}
