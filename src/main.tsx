import { render } from 'preact';
import './styles.css';
import type { Bank } from './types';
import { ctx } from './ctx';
import { openBestKv } from './lib/db';
import { loadState, PING_KEY, Store } from './lib/store';
import { detectCaps } from './lib/caps';
import { registerSW } from './lib/sw-register';
import { requestPersistence } from './lib/persist';
import { App } from './app';

async function boot() {
  const root = document.getElementById('root')!;
  try {
    const [bank, kv] = await Promise.all([
      fetch('./data/bank.json').then((r) => { if (!r.ok) throw new Error(`bank.json ${r.status}`); return r.json() as Promise<Bank>; }),
      openBestKv(),
    ]);
    let mirror: Storage | null = null;
    try { mirror = window.localStorage; } catch { mirror = null; }
    const state = await loadState(kv, mirror);
    ctx.bank = bank;
    ctx.items = new Map(bank.items.map((i) => [i.id, i]));
    ctx.caps = detectCaps();
    ctx.store = new Store(kv, state, mirror);
    root.textContent = '';
    render(<App />, root);
    window.addEventListener('storage', (e) => { if (e.key !== PING_KEY) return; if (e.newValue?.startsWith('replace:')) ctx.store.replaceEpoch++; ctx.store.reload(); }); // a reset or restore elsewhere ends an open flash round here
    // flush pending writes when the app is backgrounded
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ctx.store.flush(); });
    if (state.settings.onboarded) requestPersistence();
    registerSW();
  } catch (e) {
    root.innerHTML = '';
    const p = document.createElement('div');
    p.className = 'boot-error';
    p.innerHTML = '<h1>CMPC Prep couldn’t start</h1><p>The question bank didn’t load. If you’re offline, reconnect once so the app can be cached, then reload.</p>';
    const pre = document.createElement('pre'); pre.textContent = String(e); p.appendChild(pre);
    const b = document.createElement('button'); b.textContent = 'Reload'; b.className = 'btn primary'; b.onclick = () => location.reload(); p.appendChild(b);
    root.appendChild(p);
  }
}
boot();
