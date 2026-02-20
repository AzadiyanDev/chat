import { Injectable, OnDestroy } from '@angular/core';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: 'circle' | 'square' | 'heart' | 'star';
  gravity: number;
  friction: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
}

interface ParticleConfig {
  count?: number;
  speed?: number;
  spread?: number;
  gravity?: number;
  friction?: number;
  size?: number;
  sizeVariation?: number;
  life?: number;
  colors?: string[];
  shapes?: ('circle' | 'square' | 'heart' | 'star')[];
  direction?: number;
}

@Injectable({ providedIn: 'root' })
export class ParticleService implements OnDestroy {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: Particle[] = [];
  private animFrameId: number | null = null;
  private pool: Particle[] = [];
  private dpr = 1;
  private resizeTimer: any = null;
  private readonly resizeHandler = () => this.debouncedResize();
  private trailRafId: number | null = null;

  private ensureCanvas() {
    if (this.canvas) return;
    this.canvas = document.getElementById('particle-canvas') as HTMLCanvasElement;
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener('resize', this.resizeHandler, { passive: true });
  }

  private debouncedResize() {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.resize(), 150);
  }

  private resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.ctx) this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.trailRafId) cancelAnimationFrame(this.trailRafId);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
  }

  private getParticle(): Particle {
    return this.pool.pop() || {
      x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      size: 4, color: '#fff', shape: 'circle',
      gravity: 0, friction: 0.98, rotation: 0, rotationSpeed: 0, opacity: 1
    };
  }

  private releaseParticle(p: Particle) {
    if (this.pool.length < 500) this.pool.push(p);
  }

  emit(x: number, y: number, config: ParticleConfig = {}) {
    this.ensureCanvas();
    const {
      count = 20,
      speed = 5,
      spread = Math.PI * 2,
      gravity = 0.15,
      friction = 0.97,
      size = 5,
      sizeVariation = 2,
      life = 60,
      colors = ['#3390ec', '#4facfe', '#00f2fe', '#fff'],
      shapes = ['circle', 'square'],
      direction = -Math.PI / 2
    } = config;

    for (let i = 0; i < count; i++) {
      const p = this.getParticle();
      const angle = direction + (Math.random() - 0.5) * spread;
      const spd = speed * (0.5 + Math.random() * 0.5);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.life = life * (0.5 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.size = size + (Math.random() - 0.5) * sizeVariation;
      p.color = colors[Math.floor(Math.random() * colors.length)];
      p.shape = shapes[Math.floor(Math.random() * shapes.length)];
      p.gravity = gravity;
      p.friction = friction;
      p.rotation = Math.random() * Math.PI * 2;
      p.rotationSpeed = (Math.random() - 0.5) * 0.2;
      p.opacity = 1;
      this.particles.push(p);
    }

    if (!this.animFrameId) this.startLoop();
  }

  confetti(x: number, y: number) {
    this.emit(x, y, {
      count: 50,
      speed: 8,
      spread: Math.PI * 2,
      gravity: 0.12,
      friction: 0.97,
      size: 7,
      sizeVariation: 3,
      life: 80,
      colors: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6eb4', '#a66cff'],
      shapes: ['square', 'circle'],
    });
  }

  sparkle(x: number, y: number) {
    this.emit(x, y, {
      count: 15,
      speed: 3,
      spread: Math.PI * 2,
      gravity: 0.02,
      friction: 0.96,
      size: 3,
      life: 40,
      colors: ['#fff', '#ffd700', '#87ceeb'],
      shapes: ['star', 'circle'],
    });
  }

  heartBurst(x: number, y: number) {
    this.emit(x, y, {
      count: 12,
      speed: 5,
      spread: Math.PI,
      direction: -Math.PI / 2,
      gravity: 0.08,
      friction: 0.97,
      size: 10,
      life: 70,
      colors: ['#e53935', '#f48fb1', '#ff6090', '#ff1744'],
      shapes: ['heart'],
    });
  }

  /** rAF-based trail instead of cascading setTimeouts */
  sendTrail(fromX: number, fromY: number, toX: number, toY: number) {
    const steps = 8;
    let step = 0;
    let lastTime = 0;
    const interval = 30; // ms between steps

    const tick = (time: number) => {
      if (!lastTime) lastTime = time;
      if (time - lastTime >= interval) {
        lastTime = time;
        const t = step / steps;
        const px = fromX + (toX - fromX) * t;
        const py = fromY + (toY - fromY) * t - Math.sin(t * Math.PI) * 30;
        this.emit(px, py, {
          count: 3,
          speed: 1.5,
          spread: Math.PI * 2,
          gravity: 0.05,
          life: 25,
          size: 3,
          colors: ['#3390ec', '#64b5f6', '#90caf9'],
          shapes: ['circle'],
        });
        step++;
      }
      if (step < steps) {
        this.trailRafId = requestAnimationFrame(tick);
      } else {
        this.trailRafId = null;
      }
    };
    if (this.trailRafId) cancelAnimationFrame(this.trailRafId);
    this.trailRafId = requestAnimationFrame(tick);
  }

  private startLoop() {
    const loop = () => {
      if (this.particles.length === 0) {
        this.animFrameId = null;
        if (this.ctx && this.canvas) {
          this.ctx.clearRect(0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
        }
        return;
      }
      this.update();
      this.draw();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  /** Swap-and-pop instead of splice for O(1) removal */
  private update() {
    let i = 0;
    while (i < this.particles.length) {
      const p = this.particles[i];
      p.vy += p.gravity;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.rotation += p.rotationSpeed;
      p.opacity = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.releaseParticle(p);
        // Swap with last, don't increment i
        const last = this.particles.length - 1;
        if (i < last) this.particles[i] = this.particles[last];
        this.particles.length = last;
      } else {
        i++;
      }
    }
  }

  /** Batch draw by shape to reduce context switches */
  private draw() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    ctx.clearRect(0, 0, w, h);

    // Group by shape for fewer state changes
    const byShape: Record<string, Particle[]> = {};
    for (const p of this.particles) {
      (byShape[p.shape] ??= []).push(p);
    }

    for (const shape in byShape) {
      for (const p of byShape[shape]) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;

        switch (shape) {
          case 'circle':
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'square':
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            break;
          case 'heart':
            this.drawHeart(ctx, p.size);
            break;
          case 'star':
            this.drawStar(ctx, p.size / 2);
            break;
        }
        ctx.restore();
      }
    }
  }

  private drawHeart(ctx: CanvasRenderingContext2D, size: number) {
    const s = size / 2;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.3);
    ctx.bezierCurveTo(-s, -s * 0.5, -s * 1.5, s * 0.3, 0, s * 1.2);
    ctx.bezierCurveTo(s * 1.5, s * 0.3, s, -s * 0.5, 0, s * 0.3);
    ctx.fill();
  }

  private drawStar(ctx: CanvasRenderingContext2D, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const method = i === 0 ? 'moveTo' : 'lineTo';
      ctx[method](Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
  }
}
