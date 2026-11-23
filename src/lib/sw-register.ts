// Registers the service worker (secure contexts only) and exposes "update ready" without ever
// activating a new version on its own — the app applies updates only outside an active exam.
type Listener = (ready: boolean) => void;
let waiting: ServiceWorker | null = null;
const listeners = new Set<Listener>();
export let swStatus: 'unsupported' | 'registering' | 'active' | 'error' = 'unsupported';

function setWaiting(w: ServiceWorker | null) { waiting = w; for (const l of listeners) l(!!w); }
export function onUpdateReady(l: Listener) { listeners.add(l); l(!!waiting); return () => { listeners.delete(l); }; }

/**
 * Reports an update only when a new worker installs alongside an already active one. Whether the page is
 * controlled says nothing about that: on a first visit the new worker can claim the page before its
 * "installed" event is delivered here, which used to show "Update ready" with nothing to update to.
 */
export function watchRegistration(reg: ServiceWorkerRegistration) {
  const track = (nw: ServiceWorker) => {
    const isUpdate = !!reg.active && reg.active !== nw;
    nw.addEventListener('statechange', () => {
      if (nw.state === 'installed' && isUpdate) setWaiting(nw);
      else if ((nw.state === 'activated' || nw.state === 'redundant') && waiting === nw) setWaiting(null);
    });
  };
  reg.addEventListener('updatefound', () => { if (reg.installing) track(reg.installing); });
  if (reg.waiting && reg.active) setWaiting(reg.waiting);
  if (reg.installing) track(reg.installing); // "updatefound" may have fired before this ran
}

export async function registerSW() {
  if (!window.isSecureContext || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  swStatus = 'registering';
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    swStatus = 'active';
    watchRegistration(reg);
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
