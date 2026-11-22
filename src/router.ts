import { useEffect, useState } from 'preact/hooks';

export interface Route { path: string[]; query: URLSearchParams; raw: string }
export function parseHash(h = location.hash): Route {
  const raw = h.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw };
}
let depth = 0; // in-app pushes since load, so Back never leaves the app
export function navigate(to: string, replace = false) {
  const h = '#/' + to.replace(/^\/+/, '');
  if (replace) history.replaceState(null, '', h); else { history.pushState(null, '', h); depth++; }
  check();
}
export function back(fallback = 'today') {
  if (depth > 0) { depth--; history.back(); } else navigate(fallback, true);
}
// Route changes are detected three ways: hashchange, popstate, and a light poll of location.hash.
// (WebKit was observed to stop delivering hashchange to listeners after a reload; the poll makes routing robust.)
const subs = new Set<() => void>();
let lastHash = typeof location !== 'undefined' ? location.hash : '';
function check() { if (location.hash !== lastHash) { lastHash = location.hash; for (const f of subs) f(); } }
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', check);
  window.addEventListener('popstate', check);
  window.addEventListener('pageshow', check);
  setInterval(check, 250);
}
export function useRoute(): Route {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const on = () => setR(parseHash());
    subs.add(on);
    if (location.hash !== lastHash) check(); else on();
    return () => { subs.delete(on); };
  }, []);
  return r;
}
