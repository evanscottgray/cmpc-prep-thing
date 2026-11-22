// Registers the service worker (secure contexts only) and exposes "update ready" without ever
// activating a new version on its own — the app applies updates only outside an active exam.
type Listener = (ready: boolean) => void;
let waiting: ServiceWorker | null = null;
const listeners = new Set<Listener>();
export let swStatus: 'unsupported' | 'registering' | 'active' | 'error' = 'unsupported';

function setWaiting(w: ServiceWorker | null) { waiting = w; for (const l of listeners) l(!!w); }
export function onUpdateReady(l: Listener) { listeners.add(l); l(!!waiting); return () => listeners.delete(l); }

export async function registerSW() {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  swStatus = 'registering';
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    swStatus = 'active';
    if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) setWaiting(nw);
      });
    });
    // Check for updates when the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  } catch { swStatus = 'error'; }
}

export function applyUpdate() {
  if (!waiting) return;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
  waiting.postMessage('SKIP_WAITING');
}
