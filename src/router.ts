import { useEffect, useState } from 'preact/hooks';

export interface Route { path: string[]; query: URLSearchParams; raw: string }
export function parseHash(h = location.hash): Route {
  const raw = h.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw };
}
// Each history entry carries its index, so Back can be told from forward navigation and scroll positions restored.
let idx = 0;
const scrolls = new Map<number, number>();
let restore: number | null = null;
/** Position of the current history entry. */
export const historyIndex = () => idx;
/** Scroll position to restore after going back; null after forward navigation. Read once by the next page. */
export function takeRestore() { const r = restore; restore = null; return r; }

export function navigate(to: string, replace = false) {
  const h = '#/' + to.replace(/^\/+/, '');
  if (replace) history.replaceState({ i: idx }, '', h);
  else { scrolls.set(idx, window.scrollY); history.pushState({ i: ++idx }, '', h); }
  restore = null;
  check(true);
}
export function back(fallback = 'today') {
  if (idx > 0) history.back(); else navigate(fallback, true);
}
// Listeners are attached at module load, not in an effect: effects run after paint, so a hash change that
// lands between first render and the effect would otherwise be missed. useRoute re-reads the hash on subscribe.
const subs = new Set<() => void>();
let lastHash = typeof location !== 'undefined' ? location.hash : '';
function check(own = false) {
  const st = history.state as { i?: number } | null;
  if (location.hash === lastHash) { if (!own && typeof st?.i === 'number') idx = st.i; return; }
  if (!own) {
    scrolls.set(idx, window.scrollY);
    if (typeof st?.i === 'number') { restore = st.i < idx ? scrolls.get(st.i) ?? 0 : null; idx = st.i; } // back or forward
    else { restore = null; history.replaceState({ i: ++idx }, ''); } // a link was followed
  }
  lastHash = location.hash;
  for (const f of subs) f();
}
if (typeof window !== 'undefined') {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const st = history.state as { i?: number } | null;
  if (typeof st?.i === 'number') idx = st.i; else history.replaceState({ i: 0 }, '');
  window.addEventListener('hashchange', () => check());
  window.addEventListener('popstate', () => check());
}
export function useRoute(): Route {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const on = () => setR(parseHash());
    subs.add(on);
    check(); on();
    return () => { subs.delete(on); };
  }, []);
  return r;
}
