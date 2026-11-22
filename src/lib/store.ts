import type { DbState, Session, Settings } from '../types';
import type { Kv } from './db';

export const SCHEMA = 1;
export const DEFAULT_SETTINGS: Settings = {
  examDate: null, rawTarget: 70, mode: 'strict', dailyTarget: 40, textSize: 'm', theme: 'system',
  onboarded: false, lastBackupAt: null, backupSnoozeUntil: null, persisted: null,
};
export function emptyState(now = Date.now()): DbState {
  return { settings: { ...DEFAULT_SETTINGS }, attempts: [], sessions: {}, srs: {}, cardSrs: {}, reports: [], hidden: [], meta: { createdAt: now, schema: SCHEMA } };
}

type Part = 'settings' | 'attempts' | 'srs' | 'cardSrs' | 'reports' | 'hidden' | 'meta';
const PARTS: Part[] = ['settings', 'attempts', 'srs', 'cardSrs', 'reports', 'hidden', 'meta'];
const SESSION_PREFIX = 'session:';
const MIRROR_KEY = 'cmpc-prep:active-session';
export const PING_KEY = 'cmpc-prep:ping';

/** Loads the whole state from a Kv. Sessions are stored one per key so exam writes stay small. */
export async function loadState(kv: Kv, mirror?: Storage | null): Promise<DbState> {
  const st = emptyState();
  for (const p of PARTS) {
    const v = await kv.get(p);
    if (v !== undefined) (st as any)[p] = p === 'settings' ? { ...DEFAULT_SETTINGS, ...(v as object) } : v;
    else if (p === 'meta') await kv.set('meta', st.meta); // first run: remember when this install began
  }
  for (const k of await kv.keys()) {
    if (!k.startsWith(SESSION_PREFIX)) continue;
    const s = await kv.get<Session>(k);
    if (s) st.sessions[s.id] = s;
  }
  // A synchronous localStorage mirror of the active exam guards against a write lost when the app is killed.
  try {
    const raw = mirror?.getItem(MIRROR_KEY);
    if (raw) {
      const m = JSON.parse(raw) as Session;
      const cur = st.sessions[m.id];
      if (!cur || (m.updatedAt ?? 0) > (cur.updatedAt ?? 0)) { st.sessions[m.id] = m; await kv.set(SESSION_PREFIX + m.id, m); }
    }
  } catch { /* ignore */ }
  return st;
}

export class Store {
  state: DbState;
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  lastError: string | null = null;
  constructor(public kv: Kv, initial: DbState, private mirror: Storage | null = null) { this.state = initial; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const l of this.listeners) l(); }

  private persist(key: string, value: unknown) {
    this.queue = this.queue.then(() => this.kv.set(key, value)).then(() => this.ping()).catch((e) => { this.lastError = String(e); this.emit(); });
  }
  flush() { return this.queue; }
  /** Tell other tabs at this address that stored data changed (they reload it instead of overwriting it). */
  private ping() { try { this.mirror?.setItem(PING_KEY, `${Date.now()}-${Math.random()}`); } catch { /* */ } }
  async reload(): Promise<void> {
    await this.flush();
    const q = this.queue;
    const next = await loadState(this.kv, null);
    if (this.queue !== q) return this.reload(); // we wrote something meanwhile: read again
    this.state = next; this.emit();
  }

  set<P extends Part>(part: P, value: DbState[P]) {
    this.state = { ...this.state, [part]: value };
    this.persist(part, value);
    this.emit();
  }
  updateSettings(patch: Partial<Settings>) { this.set('settings', { ...this.state.settings, ...patch }); }

  putSession(s: Session) {
    const next = { ...s, updatedAt: Date.now() };
    this.state = { ...this.state, sessions: { ...this.state.sessions, [s.id]: next } };
    this.persist(SESSION_PREFIX + s.id, next);
    try {
      if (next.timed && next.status === 'active') this.mirror?.setItem(MIRROR_KEY, JSON.stringify(next));
      else if (this.mirror?.getItem(MIRROR_KEY)?.includes(`"id":"${s.id}"`)) this.mirror.removeItem(MIRROR_KEY);
    } catch { /* quota or unavailable */ }
    this.emit();
  }
  deleteSession(id: string) {
    const { [id]: _, ...rest } = this.state.sessions;
    this.state = { ...this.state, sessions: rest };
    this.queue = this.queue.then(() => this.kv.del(SESSION_PREFIX + id)).then(() => this.ping()).catch(() => {});
    try { if (this.mirror?.getItem(MIRROR_KEY)?.includes(`"id":"${id}"`)) this.mirror.removeItem(MIRROR_KEY); } catch { /* */ }
    this.emit();
  }

  /** Replace everything (restore / reset). */
  async replaceAll(next: DbState) {
    await this.flush();
    await this.kv.clear();
    for (const p of PARTS) await this.kv.set(p, next[p]);
    for (const s of Object.values(next.sessions)) await this.kv.set(SESSION_PREFIX + s.id, s);
    try { this.mirror?.removeItem(MIRROR_KEY); } catch { /* */ }
    this.ping();
    this.state = next;
    this.emit();
  }
}
