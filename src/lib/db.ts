// Durable key–value storage: IndexedDB first, localStorage fallback, memory as a last resort.
export interface Kv {
  kind: 'indexeddb' | 'localstorage' | 'memory';
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

const DB_NAME = 'cmpc-prep';
const STORE = 'kv';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function openIdb(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<Kv> {
  const db: IDBDatabase = await new Promise((res, rej) => {
    const r = factory.open(name, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('IndexedDB blocked'));
  });
  const tx = (mode: IDBTransactionMode) => db.transaction(STORE, mode).objectStore(STORE);
  const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return {
    kind: 'indexeddb',
    get: (k) => req(tx('readonly').get(k)),
    async set(k, v) { const s = tx('readwrite'); s.put(v, k); await done(s.transaction); },
    async del(k) { const s = tx('readwrite'); s.delete(k); await done(s.transaction); },
    keys: async () => (await req(tx('readonly').getAllKeys())).map(String),
    async clear() { const s = tx('readwrite'); s.clear(); await done(s.transaction); },
  };
}

export function localKv(storage: Storage, prefix = 'cmpc-prep:'): Kv {
  return {
    kind: 'localstorage',
    async get(k) { const v = storage.getItem(prefix + k); return v === null ? undefined : JSON.parse(v); },
    async set(k, v) { storage.setItem(prefix + k, JSON.stringify(v)); },
    async del(k) { storage.removeItem(prefix + k); },
    async keys() { const out: string[] = []; for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(prefix)) out.push(k.slice(prefix.length)); } return out; },
    async clear() { for (const k of await this.keys()) storage.removeItem(prefix + k); },
  };
}

export function memoryKv(): Kv {
  const m = new Map<string, string>();
  return {
    kind: 'memory',
    async get(k) { const v = m.get(k); return v === undefined ? undefined : JSON.parse(v); },
    async set(k, v) { m.set(k, JSON.stringify(v)); },
    async del(k) { m.delete(k); },
    async keys() { return [...m.keys()]; },
    async clear() { m.clear(); },
  };
}

export async function openBestKv(): Promise<Kv> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const kv = await Promise.race([openIdb(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      await kv.set('__probe', 1);
      return kv;
    }
  } catch { /* fall through */ }
  try {
    localStorage.setItem('cmpc-prep:__probe', '1');
    return localKv(localStorage);
  } catch { /* fall through */ }
  return memoryKv();
}
