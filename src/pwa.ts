interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export class IslandPWA {
  status: 'unavailable' | 'downloading' | 'ready' | 'error' = 'unavailable';
  updateAvailable = false;
  updateDismissed = false;
  installed = matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
  readonly apple = /iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  onChange: () => void = () => {};
  private prompt: InstallPrompt | null = null;
  private registration: ServiceWorkerRegistration | null = null;
  private reloadRequested = false;
  private controlled = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;

  constructor() {
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); this.prompt = event as InstallPrompt; this.onChange(); });
    window.addEventListener('appinstalled', () => { this.installed = true; this.prompt = null; this.onChange(); });
    matchMedia('(display-mode: standalone)').addEventListener('change', event => { this.installed = event.matches; this.onChange(); });
  }

  get canInstall() { return !!this.prompt && !this.installed; }

  start() {
    // Never cache development modules or interfere with hot reload.
    if (!import.meta.env.PROD || !window.isSecureContext || !('serviceWorker' in navigator)) return;
    this.status = 'downloading'; this.onChange();
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (this.reloadRequested) { location.reload(); return; }
      if (this.controlled) { this.updateAvailable = true; this.updateDismissed = false; }
      this.controlled = true; this.status = 'ready'; this.onChange();
    });
    const register = async () => {
      try {
        const registration = this.registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
        const track = () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) { this.updateAvailable = true; this.updateDismissed = false; this.onChange(); }
            if (worker.state === 'redundant' && !registration.active) { this.status = 'error'; this.onChange(); }
          });
        };
        track(); registration.addEventListener('updatefound', track);
        if (registration.waiting) { this.updateAvailable = true; this.onChange(); }
        await navigator.serviceWorker.ready;
        this.status = 'ready'; this.onChange();
      } catch { this.status = 'error'; this.onChange(); }
    };
    if (document.readyState === 'complete') void register(); else window.addEventListener('load', () => { void register(); }, { once: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) void this.registration?.update().catch(() => {}); });
    window.addEventListener('online', () => { if (this.status === 'error') void register(); else void this.registration?.update().catch(() => {}); });
  }

  async install(): Promise<'accepted' | 'dismissed' | 'instructions' | 'error'> {
    const prompt = this.prompt;
    if (!prompt) return 'instructions';
    this.prompt = null;
    try { await prompt.prompt(); return (await prompt.userChoice).outcome; }
    catch { return 'error'; }
    finally { this.onChange(); }
  }

  dismissUpdate() { this.updateDismissed = true; this.onChange(); }

  applyUpdate() {
    if (!this.updateAvailable) return;
    this.reloadRequested = true;
    if (this.registration?.waiting) this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    else location.reload(); // Another tab may already have activated the new version.
  }
}
