import { Injectable, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * PWA install prompt & update management.
 *
 * - Captures the `beforeinstallprompt` event for deferred A2HS.
 * - Monitors service-worker version updates and prompts reload.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  /** True when the browser shows a deferred install prompt is available */
  canInstall = signal(false);

  /** True when a new SW version is waiting to activate */
  updateAvailable = signal(false);

  private deferredPrompt: any = null;

  constructor(private swUpdate: SwUpdate) {
    // Capture the beforeinstallprompt event (Chrome / Edge / Samsung)
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall.set(true);
    });

    // Detect when the app has been installed
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
    });

    // SW update detection
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
        .subscribe(() => {
          this.updateAvailable.set(true);
        });
    }
  }

  /**
   * Trigger the native install prompt (A2HS).
   * Returns true if the user accepted.
   */
  async promptInstall(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstall.set(false);
    return outcome === 'accepted';
  }

  /**
   * Reload the page to activate the waiting service worker.
   */
  activateUpdate(): void {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.activateUpdate().then(() => document.location.reload());
    }
  }
}
