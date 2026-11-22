import { useEffect, useState } from 'preact/hooks';
import type { Bank, DbState, Item } from './types';
import type { Store } from './lib/store';
import type { Caps } from './lib/caps';

declare const __APP_VERSION__: string;
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export const ctx = {} as { store: Store; bank: Bank; caps: Caps; items: Map<string, Item> };

export function useDb(): DbState {
  const [s, set] = useState(ctx.store.state);
  useEffect(() => { set(ctx.store.state); return ctx.store.subscribe(() => set(ctx.store.state)); }, []);
  return s;
}
export function useNow(intervalMs = 1000, on = true): number {
  const [n, set] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set(Date.now()), intervalMs);
    const vis = () => set(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [intervalMs, on]);
  return n;
}
