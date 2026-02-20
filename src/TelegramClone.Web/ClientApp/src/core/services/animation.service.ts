import { Injectable, inject } from '@angular/core';
import { ParticleService } from './particle.service';

declare var gsap: any;
declare var ScrollToPlugin: any;

@Injectable({ providedIn: 'root' })
export class AnimationService {
  private particles = inject(ParticleService);
  private themeTransitionTl: any = null;

  private get g(): any {
    return typeof gsap !== 'undefined' ? gsap : null;
  }

  // ============ Page Transitions ============

  pageTransitionIn(element: HTMLElement | string) {
    if (!this.g) return;
    const tl = this.g.timeline();
    tl.fromTo(element,
      { x: '100%', opacity: 0.8, scale: 0.95 },
      { x: '0%', opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }
    );
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
      const header = el.querySelector('header');
      const footer = el.querySelector('footer');
      if (header) {
        tl.fromTo(header, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, '-=0.3');
      }
      if (footer) {
        tl.fromTo(footer, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, '-=0.25');
      }
    }
  }

  /** Replaced filter:blur with opacity+scale for GPU-friendly exit */
  pageTransitionOut(element: HTMLElement | string, onComplete: () => void) {
    if (!this.g) { onComplete(); return; }
    this.g.to(element, {
      x: '30%',
      opacity: 0,
      scale: 0.92,
      duration: 0.3,
      ease: 'power3.inOut',
      onComplete
    });
  }

  // ============ Send Message Animation ============

  toggleActionButtons(showSend: boolean, sendBtn: HTMLElement, micBtn: HTMLElement) {
    if (!this.g) return;
    if (showSend) {
      this.g.to(micBtn, { scale: 0.3, opacity: 0, rotation: -90, duration: 0.2, ease: 'back.in(2)', overwrite: 'auto' });
      this.g.fromTo(sendBtn,
        { scale: 0.3, opacity: 0, rotation: 90 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.35, ease: 'back.out(2)', delay: 0.05, overwrite: 'auto' }
      );
    } else {
      this.g.to(sendBtn, { scale: 0.3, opacity: 0, rotation: 90, duration: 0.2, ease: 'back.in(2)', overwrite: 'auto' });
      this.g.fromTo(micBtn,
        { scale: 0.3, opacity: 0, rotation: -90 },
        { scale: 1, opacity: 1, rotation: 0, duration: 0.35, ease: 'back.out(2)', delay: 0.05, overwrite: 'auto' }
      );
    }
  }

  /** Professional send-message morph: source input → bubble position */
  animateSendText(params: {
    sourceTextEl: HTMLElement,
    targetPlaceholderEl: HTMLElement,
    text: string,
    isMine: boolean
  }): Promise<void> {
    return new Promise((resolve) => {
      if (!this.g) { resolve(); return; }

      const { sourceTextEl, targetPlaceholderEl, text, isMine } = params;
      const sourceRect = sourceTextEl.getBoundingClientRect();
      const targetRect = targetPlaceholderEl.getBoundingClientRect();

      const clone = document.createElement('div');
      clone.innerText = text;
      clone.style.cssText = `
        position:fixed; z-index:9999; pointer-events:none;
        left:${sourceRect.left}px; top:${sourceRect.top}px;
        width:${sourceRect.width}px; height:${sourceRect.height}px;
        font-size:15px; font-family:inherit; line-height:1.5;
        color:currentColor; padding:8px 12px; margin:0; box-sizing:border-box;
        white-space:pre-wrap; word-break:break-word;
        background:transparent; border-radius:18px;
        opacity:1; will-change:transform,opacity;
        transform-origin:${isMine ? 'bottom right' : 'bottom left'};
      `;
      document.body.appendChild(clone);

      const bubbleBg = isMine ? 'var(--tg-bubble-out)' : 'var(--tg-bubble-in, #fff)';
      const bubbleColor = isMine ? '#ffffff' : 'var(--tg-text)';
      const bubbleBR = isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px';

      // Particle trail from source center to target center
      this.particles.sendTrail(
        sourceRect.left + sourceRect.width / 2,
        sourceRect.top + sourceRect.height / 2,
        targetRect.left + targetRect.width / 2,
        targetRect.top + targetRect.height / 2
      );

      const tl = this.g.timeline({
        onComplete: () => { clone.remove(); resolve(); }
      });

      // Phase 1: lift & shrink from input (0 → 0.15s)
      tl.to(clone, {
        scale: 0.88,
        opacity: 0.9,
        duration: 0.12,
        ease: 'power2.in'
      }, 0);

      // Phase 2: fly to target position with morph (0.12 → 0.42s)
      tl.to(clone, {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        scale: 1,
        opacity: 1,
        backgroundColor: bubbleBg,
        color: bubbleColor,
        borderRadius: bubbleBR,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        padding: '8px 12px',
        duration: 0.3,
        ease: 'power3.out'
      }, 0.12);

      // Phase 3: subtle elastic settle (overshoot)
      tl.to(clone, {
        scale: 1.03,
        duration: 0.08,
        ease: 'power1.out'
      }, 0.42);
      tl.to(clone, {
        scale: 1,
        duration: 0.12,
        ease: 'power2.out'
      }, 0.50);
    });
  }

  popInMessage(element: HTMLElement) {
    if (!this.g) return;
    this.g.fromTo(element,
      { scale: 0.85, y: 20, opacity: 0 },
      { scale: 1, y: 0, opacity: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' }
    );
  }

  popInMessageFromLeft(element: HTMLElement) {
    if (!this.g) return;
    this.g.fromTo(element,
      { x: -40, scale: 0.9, opacity: 0 },
      { x: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'elastic.out(1, 0.6)' }
    );
  }

  // ============ Theme Transition ============

  morphThemeTransition(x: number, y: number, callback: () => void, onComplete?: () => void) {
    const overlay = document.getElementById('theme-reveal-overlay') as HTMLElement | null;
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!this.g || !overlay || reduceMotion) {
      callback();
      onComplete?.();
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    const cx = Math.max(0, Math.min(x, width));
    const cy = Math.max(0, Math.min(y, height));
    const maxRadius = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy)) + 36;

    const rootStyles = getComputedStyle(document.documentElement);
    const oldBg = getComputedStyle(document.body).backgroundColor || rootStyles.getPropertyValue('--tg-bg').trim() || '#0f0f0f';
    const oldPrimary = rootStyles.getPropertyValue('--tg-primary').trim() || '#3390ec';

    this.themeTransitionTl?.kill();
    this.resetThemeOverlay(overlay);

    const washLayer = document.createElement('div');
    washLayer.style.cssText = `
      position:absolute; inset:0; pointer-events:none;
      background:${oldBg};
      clip-path:circle(0px at ${cx}px ${cy}px);
      opacity:0.92;
      will-change: clip-path, opacity;
      transform:translateZ(0);
    `;

    const glowLayer = document.createElement('div');
    glowLayer.style.cssText = `
      position:absolute; pointer-events:none;
      left:${cx}px; top:${cy}px; width:22px; height:22px; border-radius:9999px;
      background:radial-gradient(circle, ${oldPrimary} 0%, rgba(255,255,255,0.28) 42%, rgba(255,255,255,0) 72%);
      transform:translate(-50%, -50%) scale(0.24);
      opacity:0.75;
      will-change: transform, opacity;
      mix-blend-mode:screen;
    `;

    overlay.append(washLayer, glowLayer);
    overlay.style.pointerEvents = 'none';
    overlay.style.opacity = '1';
    overlay.style.background = 'transparent';

    callback();

    this.themeTransitionTl = this.g.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        this.resetThemeOverlay(overlay);
        this.themeTransitionTl = null;
        onComplete?.();
      }
    });

    this.themeTransitionTl
      .to(washLayer, {
        clipPath: `circle(${maxRadius}px at ${cx}px ${cy}px)`,
        duration: 0.46,
        ease: 'power3.out'
      }, 0)
      .to(washLayer, {
        opacity: 0,
        duration: 0.2,
        ease: 'power2.out'
      }, 0.28)
      .to(glowLayer, {
        scale: Math.max(1.8, maxRadius / 36),
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out'
      }, 0)
      .to(overlay, {
        opacity: 0,
        duration: 0.16,
        ease: 'power1.out'
      }, 0.45);
  }

  private resetThemeOverlay(overlay: HTMLElement) {
    overlay.replaceChildren();
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.clipPath = '';
    overlay.style.background = '';
  }

  // ============ List Animations ============

  staggerListItems(container: HTMLElement, selector = '.chat-item') {
    if (!this.g) return;
    const items = container.querySelectorAll(selector);
    if (!items.length) return;
    this.g.fromTo(items,
      { y: 30, opacity: 0, scale: 0.95 },
      { y: 0, opacity: 1, scale: 1, duration: 0.4, stagger: 0.04, ease: 'power2.out' }
    );
  }

  // ============ Micro-Interactions ============

  elasticButton(element: HTMLElement) {
    if (!this.g) return;
    this.g.fromTo(element,
      { scale: 0.85 },
      { scale: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }
    );
  }

  /** Uses CSS class for ripple container instead of mutating style props */
  rippleEffect(event: MouseEvent | TouchEvent, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    let x: number, y: number;
    if ('touches' in event) {
      x = event.touches[0].clientX - rect.left;
      y = event.touches[0].clientY - rect.top;
    } else {
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
    }

    // Add class instead of mutating inline styles
    if (!element.classList.contains('ripple-container')) {
      element.classList.add('ripple-container');
    }

    const ripple = document.createElement('span');
    ripple.className = 'ripple-wave';
    const size = Math.max(rect.width, rect.height) * 2;
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${x - size / 2}px;top:${y - size / 2}px;`;
    element.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }

  shakeElement(element: HTMLElement) {
    if (!this.g) return;
    this.g.fromTo(element,
      { x: 0 },
      { x: 5, duration: 0.08, repeat: 5, yoyo: true, ease: 'power2.inOut', clearProps: 'x' }
    );
  }

  confettiExplosion(x: number, y: number) {
    this.particles.confetti(x, y);
  }

  floatingHearts(x: number, y: number) {
    this.particles.heartBurst(x, y);
  }

  slideInFromBottom(element: HTMLElement, height = 300) {
    if (!this.g) return;
    this.g.fromTo(element,
      { y: height, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.3)' }
    );
  }

  slideOutToBottom(element: HTMLElement, onComplete?: () => void) {
    if (!this.g) { onComplete?.(); return; }
    this.g.to(element, {
      y: 300, opacity: 0, duration: 0.3, ease: 'power2.in',
      onComplete
    });
  }

  scaleIn(element: HTMLElement) {
    if (!this.g) return;
    this.g.fromTo(element,
      { scale: 0.5, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.7)' }
    );
  }

  scaleOut(element: HTMLElement, onComplete?: () => void) {
    if (!this.g) { onComplete?.(); return; }
    this.g.to(element, {
      scale: 0.5, opacity: 0, duration: 0.2, ease: 'back.in(1.7)',
      onComplete
    });
  }

  smoothScrollTo(container: HTMLElement, target: number | HTMLElement) {
    if (!this.g) return;
    this.g.to(container, {
      scrollTo: { y: target, autoKill: false },
      duration: 0.6,
      ease: 'power2.inOut'
    });
  }

  staggerMenuItems(container: HTMLElement, selector: string) {
    if (!this.g) return;
    const items = container.querySelectorAll(selector);
    this.g.fromTo(items,
      { y: 10, opacity: 0, scale: 0.9 },
      { y: 0, opacity: 1, scale: 1, duration: 0.25, stagger: 0.04, ease: 'back.out(1.5)' }
    );
  }

  animateTicks(element: HTMLElement) {
    if (!this.g) return;
    this.g.fromTo(element, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' });
  }

  bounceIn(element: HTMLElement) {
    if (!this.g) return;
    this.g.fromTo(element,
      { scale: 0, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }
    );
  }

  fanOutButtons(buttons: HTMLElement[]) {
    if (!this.g) return;
    this.g.fromTo(buttons,
      { scale: 0, opacity: 0, y: 20 },
      { scale: 1, opacity: 1, y: 0, duration: 0.3, stagger: 0.06, ease: 'back.out(2)' }
    );
  }

  fanInButtons(buttons: HTMLElement[], onComplete?: () => void) {
    if (!this.g) { onComplete?.(); return; }
    this.g.to(buttons, {
      scale: 0, opacity: 0, y: 20, duration: 0.2, stagger: 0.03, ease: 'back.in(2)',
      onComplete
    });
  }
}
