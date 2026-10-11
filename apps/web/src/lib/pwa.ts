/** Installing the site like an app, and the tiny service worker that shows an offline page. */

/** Only the built site registers it: during development a worker would fight hot reloading. */
export function registerServiceWorker(): void {
  if (process.env.NODE_ENV !== 'production' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
}

/** iPhones and iPads cannot show an install button: the person has to use Safari's Share menu. */
export function isIosDevice(userAgent: string, maxTouchPoints = 0): boolean {
  // Newer iPads say they are Macs; the touch screen gives them away.
  return /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

/** True when the app was opened from the home screen (no browser bars). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** The event Chrome and Edge fire when the site can be installed. It is not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
