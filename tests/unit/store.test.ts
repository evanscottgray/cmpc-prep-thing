import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { openIdb, memoryKv } from '../../src/lib/db';
import { Store, loadState, emptyState } from '../../src/lib/store';
import { makeBackup, parseBackup } from '../../src/lib/backup';
import type { Session } from '../../src/types';

const sess = (id: string, extra: Partial<Session> = {}): Session => ({
  id, kind: 'formA', title: 'Form A', createdAt: 1, timed: true, mode: 'strict', durationMs: 5400000, startedAt: 1, pausedAt: null, pausedMs: 0,
  items: [{ id: 'G-III-001', scored: true, order: [2, 0, 3, 1] }], responses: { 0: 3 }, flags: [0], strikes: { 0: [1] }, unsure: [], revealed: [], timeOnItem: { 0: 1234 },
  current: 0, visitAt: 5, status: 'active', submittedAt: null, autoSubmitted: false, retake: false, seenBefore: 0, result: null, ...extra,
});

class MemStorage implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); } getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; } removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

describe('persistence (IndexedDB)', () => {
  it('survives a reload exactly', async () => {
    const kv = await openIdb(indexedDB, 'test-1');
    const store = new Store(kv, await loadState(kv, null), null);
    store.updateSettings({ examDate: '2026-04-01', rawTarget: 68, onboarded: true });
    store.set('attempts', [{ i: 'G-III-001', t: 10, ok: true, src: 'drill', ms: 3000 }]);
    store.putSession(sess('a'));
    store.set('srs', { 'G-III-001': { box: 1, due: '2026-03-03', last: 9 } });
    await store.flush();
    const reloaded = await loadState(await openIdb(indexedDB, 'test-1'), null);
    expect(reloaded).toEqual(store.state);
  });
  it('recovers the latest exam state from the synchronous mirror if the last async write was lost', async () => {
    const mirror = new MemStorage();
    const kv = memoryKv();
    const store = new Store(kv, emptyState(1), mirror);
    store.putSession(sess('b'));
    await store.flush();
    // simulate: newer state reached the mirror but the IndexedDB write never landed
    const newer = { ...store.state.sessions.b, responses: { 0: 2 }, current: 0, updatedAt: Date.now() + 1000 };
    mirror.setItem('cmpc-prep:active-session', JSON.stringify(newer));
    const loaded = await loadState(kv, mirror);
    expect(loaded.sessions.b.responses).toEqual({ 0: 2 });
  });
  it('replaceAll clears old keys', async () => {
    const kv = memoryKv();
    const store = new Store(kv, emptyState(1), null);
    store.putSession(sess('old'));
    await store.replaceAll(emptyState(2));
    const loaded = await loadState(kv, null);
    expect(Object.keys(loaded.sessions)).toEqual([]);
  });
});

describe('backup and restore', () => {
  it('round-trips exactly', async () => {
    const kv = memoryKv();
    const store = new Store(kv, emptyState(1), null);
    store.updateSettings({ examDate: '2026-04-01', theme: 'dark', textSize: 'l', lastBackupAt: 77 });
    store.set('attempts', Array.from({ length: 50 }, (_, i) => ({ i: `X-${i}`, t: i, ok: i % 3 === 0, src: 'exam' as const, ms: i * 100, unsure: i % 5 === 0 || undefined })));
    store.putSession(sess('c', { status: 'submitted', submittedAt: 99 }));
    store.set('cardSrs', { 'card-g-izof': { box: 2, due: '2026-03-09', last: 1 } });
    store.set('reports', [{ id: 'r1', itemId: 'G-III-001', kind: 'ambiguous', note: 'two answers?', at: 5, appVersion: '1.0.0', contentVersion: 'abc' }]);
    store.set('hidden', ['G-III-002']);
    await store.flush();
    const file = JSON.stringify(makeBackup(store.state, '1.0.0', 'abc', 1000));
    const target = new Store(memoryKv(), emptyState(2), null);
    await target.replaceAll(parseBackup(file).state);
    const reloaded = await loadState(target.kv, null);
    expect(reloaded).toEqual(JSON.parse(JSON.stringify(store.state)));
    expect(JSON.stringify(makeBackup(reloaded, '1.0.0', 'abc', 1000))).toBe(file);
  });
  it('rejects files that are not backups', () => {
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/);
    expect(() => parseBackup('{"app":"x"}')).toThrow(/not a CMPC Prep backup/);
    expect(() => parseBackup(JSON.stringify({ app: 'cmpc-prep', kind: 'backup', schema: 99, state: {} }))).toThrow(/newer version/);
  });
});
