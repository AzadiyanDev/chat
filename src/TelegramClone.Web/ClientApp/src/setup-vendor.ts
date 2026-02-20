/**
 * Global setup for third-party libraries.
 * Replaces CDN <script> tags with bundled npm imports.
 * Import this once in main.ts.
 */
import gsap from 'gsap';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import lottie from 'lottie-web';

// Register GSAP plugins
gsap.registerPlugin(ScrollToPlugin);

// Expose globally for existing code that uses `declare var gsap: any`
(window as any).gsap = gsap;
(window as any).ScrollToPlugin = ScrollToPlugin;
(window as any).lottie = lottie;

// Phosphor icons — CSS imported via angular.json styles array (not via JS CDN loader)
