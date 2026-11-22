// Keeps the screen awake during timed sessions where the Screen Wake Lock API exists (secure contexts only).
let sentinel: { release(): Promise<void>; released?: boolean } | null = null;
let wanted = false;

async function acquire() {
  try {
    const wl = (navigator as any).wakeLock;
    if (!wl || document.visibilityState !== 'visible') return;
    sentinel = await wl.request('screen');
  } catch { sentinel = null; }
}
function onVis() { if (wanted && document.visibilityState === 'visible' && (!sentinel || sentinel.released)) acquire(); }

export function keepAwake(on: boolean) {
  if (on === wanted) return;
  wanted = on;
  if (on) { document.addEventListener('visibilitychange', onVis); acquire(); }
  else { document.removeEventListener('visibilitychange', onVis); sentinel?.release().catch(() => {}); sentinel = null; }
}
export const wakeLockActive = () => !!sentinel && !sentinel.released;
