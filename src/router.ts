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
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
export function back(fallback = 'today') {
  if (depth > 0) { depth--; history.back(); } else navigate(fallback, true);
}
export function useRoute(): Route {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const on = () => setR(parseHash());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on); };
  }, []);
  return r;
}
