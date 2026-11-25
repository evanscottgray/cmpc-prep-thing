import { beforeEach, describe, expect, it } from 'vitest';
import { ctx } from '../../src/ctx';
import { localKv, memoryKv, type Kv } from '../../src/lib/db';
import { Store, cleanFlash, emptyState, loadState } from '../../src/lib/store';
import { makeBackup, parseBackup, summarize } from '../../src/lib/backup';
import { buildRound, flashCounts, gradeFlash, isAheadNow, roundStamp } from '../../src/lib/flash';
import { studyDays } from '../../src/lib/streak';
import { addDays, ymd } from '../../src/lib/dates';
import type { Bank, DbState, Flash, KgId } from '../../src/types';
import { loadBank } from './helpers';

class MemStorage implements Storage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); } getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; } removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, String(v)); }
}

// A small flash set of our own, so these tests don't depend on the written content.
const fact = (id: string, kg: KgId, card: string, type: 'mc' | 'tf' = 'mc'): Flash => type === 'tf'
  ? { id, kg, card, type, prompt: `Statement ${id}.`, answer: true, explain: 'Because.', refs: ['weinberg2024'] }
  : { id, kg, card, type, prompt: `Question ${id}?`, options: ['a', 'b', 'c'], answer: 1, explain: 'Because.', refs: ['weinberg2024'] };
const base = loadBank();
const FLASH: Flash[] = [
  fact('fl-g-001', 'G', 'c-g1'), fact('fl-g-002', 'G', 'c-g1', 'tf'), fact('fl-g-003', 'G', 'c-g2'), fact('fl-g-004', 'G', 'c-g3'),
  fact('fl-i-001', 'I', 'c-i1'), fact('fl-i-002', 'I', 'c-i2'), fact('fl-i-003', 'I', 'c-i3', 'tf'), fact('fl-e-001', 'E', 'c-e1'),
];
const bank: Bank = { ...base, flash: FLASH };

/** A device as v1.3.0 left it: every legacy part present, no flash key. */
function legacyState(now = Date.now()): DbState {
  const st = emptyState(1700000000000);
  const { flash: _, ...rest } = st;
  return {
    ...rest,
    settings: { ...st.settings, examDate: addDays(ymd(now), 30), onboarded: true, persisted: true, lastBackupAt: 5 },
    attempts: [{ i: 'G-III-001', t: now - 86400000, ok: true, src: 'drill', ms: 3000 }, { i: 'I-IV-002', t: now - 86400000, ok: false, src: 'quiz', unsure: true }],
    srs: { 'I-IV-002': { box: 0, due: ymd(now), last: now - 86400000 } },
    cardSrs: { 'card-g-izof': { box: 1, due: addDays(ymd(now), 2), last: now - 86400000 } },
    reports: [{ id: 'r1', itemId: 'G-III-001', kind: 'typo', note: 'x', at: 3, appVersion: '1.3.0', contentVersion: 'v' }],
    hidden: ['A-I-001'],
    meta: { createdAt: 1700000000000, schema: 1, exposed: ['B-II-003'], days: [ymd(now - 2 * 86400000)] },
  } as unknown as DbState;
}
async function writeLegacy(kv: Kv, st: DbState) {
  for (const p of ['settings', 'attempts', 'srs', 'cardSrs', 'reports', 'hidden', 'meta'] as const) await kv.set(p, st[p]);
}
async function dump(kv: Kv) { const o: Record<string, string> = {}; for (const k of (await kv.keys()).sort()) o[k] = JSON.stringify(await kv.get(k)); return o; }

beforeEach(() => {
  ctx.bank = bank; ctx.items = new Map(bank.items.map((i) => [i.id, i]));
  ctx.store = new Store(memoryKv(), { ...legacyState(), flash: { srs: {}, days: [] } }, null);
});

describe('upgrading a v1.3.0 device', () => {
  for (const [name, make] of [['IndexedDB-like memory store', () => memoryKv()], ['localStorage fallback', () => localKv(new MemStorage())]] as const) {
    it(`loads every legacy part unchanged and writes nothing (${name})`, async () => {
      const kv = make();
      const legacy = legacyState();
      await writeLegacy(kv, legacy);
      const before = await dump(kv);
      const st = await loadState(kv, null);
      const { flash, ...rest } = st;
      expect(rest).toEqual({ ...legacy, sessions: {} });
      expect(flash).toEqual({ srs: {}, days: [] });
      expect(await dump(kv)).toEqual(before); // no key added or rewritten on first load
    });
  }
  it('a flash grade touches only the flash key', async () => {
    const kv = memoryKv();
    await writeLegacy(kv, legacyState());
    ctx.store = new Store(kv, await loadState(kv, null), null);
    const before = await dump(kv);
    const parts = JSON.stringify({ ...ctx.store.state, flash: null });
    expect(gradeFlash('fl-g-001', 'right', undefined, false, roundStamp())).toBe(true);
    await ctx.store.flush();
    const after = await dump(kv);
    expect(Object.keys(after).filter((k) => after[k] !== before[k])).toEqual(['flash']);
    expect(JSON.stringify({ ...ctx.store.state, flash: null })).toBe(parts);
  });
  it('unreadable JSON under the flash key (localStorage fallback) loads as empty and stays on disk', async () => {
    const ls = new MemStorage();
    const kv = localKv(ls);
    await writeLegacy(kv, legacyState());
    ls.setItem('cmpc-prep:flash', '{not json');
    const st = await loadState(kv, null);
    expect(st.flash).toEqual({ srs: {}, days: [] });
    expect(st.attempts).toHaveLength(2);
    expect(ls.getItem('cmpc-prep:flash')).toBe('{not json');
  });
  it('a malformed stored flash value is ignored in memory and left alone on disk', async () => {
    const kv = memoryKv();
    await writeLegacy(kv, legacyState());
    const bad = { srs: { 'fl-g-001': null, 'fl-g-003': { box: 1, due: '2026-01-02', last: 4 } }, days: ['2026-01-01', 7] };
    await kv.set('flash', bad);
    const st = await loadState(kv, null);
    expect(st.flash).toEqual({ srs: { 'fl-g-003': { box: 1, due: '2026-01-02', last: 4 } }, days: ['2026-01-01'] });
    expect(await kv.get('flash')).toEqual(bad);
    expect(flashCounts(bank, st).practiced).toBe(1); // nothing crashes on the bad entry
  });
});

describe('scheduling', () => {
  const srs = () => ctx.store.state.flash.srs;
  it('keeps every entry: right raises the level, wrong resets it and brings it back tomorrow', () => {
    const st = roundStamp(), today = ymd();
    gradeFlash('fl-g-001', 'right', undefined, false, st);
    expect(srs()['fl-g-001'].box).toBe(1);
    gradeFlash('fl-g-001', 'right', srs()['fl-g-001'], false, st);
    expect(srs()['fl-g-001'].box).toBe(2);
    gradeFlash('fl-g-001', 'wrong', srs()['fl-g-001'], false, st);
    expect(srs()['fl-g-001']).toMatchObject({ box: 0, due: addDays(today, 1) });
    expect(ctx.store.state.flash.days).toEqual([today]);
  });
  it('"That was a guess" re-grades from the entry before the answer', () => {
    const st = roundStamp();
    gradeFlash('fl-g-003', 'right', undefined, false, st);
    expect(srs()['fl-g-003'].box).toBe(1);
    gradeFlash('fl-g-003', 'unsure', undefined, false, st); // prev = before this round's answer (a new fact)
    expect(srs()['fl-g-003'].box).toBe(0);
    gradeFlash('fl-g-004', 'right', { box: 2, due: ymd(), last: 1 }, false, st);
    gradeFlash('fl-g-004', 'unsure', { box: 2, due: ymd(), last: 1 }, false, st);
    expect(srs()['fl-g-004'].box).toBe(2);
  });
  it('practice ahead never raises a level; a miss there still resets it', () => {
    const st = roundStamp();
    const e = { box: 2, due: addDays(ymd(), 5), last: 1 };
    ctx.store.set('flash', { srs: { 'fl-i-001': e }, days: [] });
    gradeFlash('fl-i-001', 'right', e, true, st);
    expect(srs()['fl-i-001']).toEqual(e);
    gradeFlash('fl-i-001', 'wrong', e, true, st);
    expect(srs()['fl-i-001'].box).toBe(0);
  });
  it('a round begun after another tab announced a restore, but before the reload landed, cannot save', () => {
    ctx.store.replaceEpoch++; // the replace: ping
    const st = roundStamp(); // built from the old state, still in memory
    ctx.store.replaceEpoch++; // the reload has landed
    expect(gradeFlash('fl-g-001', 'right', undefined, false, st)).toBe(false);
    expect(srs()).toEqual({});
  });
  it('an answer given while that reload is still pending is not saved', () => {
    ctx.store.replaceEpoch++; ctx.store.replacing++; // first ping, its reload pending
    ctx.store.replaceEpoch++; ctx.store.replacing++; // a second ping overlaps it
    ctx.store.replacing--; ctx.store.replaceEpoch++; // the first reload lands; the second is still loading
    const st = roundStamp();
    expect(gradeFlash('fl-g-001', 'right', undefined, false, st)).toBe(false);
    expect(srs()).toEqual({});
    ctx.store.replacing--; ctx.store.replaceEpoch++; // both landed: a round built now saves
    expect(gradeFlash('fl-g-001', 'right', undefined, false, roundStamp())).toBe(true);
  });
  it('decides practice ahead from the entry as stored now', () => {
    const today = ymd();
    expect(isAheadNow(ctx.store.state, 'fl-g-001', today)).toBe(false); // never practised
    ctx.store.set('flash', { srs: { 'fl-g-001': { box: 1, due: addDays(today, 2), last: 1 }, 'fl-g-003': { box: 1, due: today, last: 1 } }, days: [] });
    expect(isAheadNow(ctx.store.state, 'fl-g-001', today)).toBe(true);
    expect(isAheadNow(ctx.store.state, 'fl-g-003', today)).toBe(false);
  });
  it('stops saving after a reset or restore (same device, same createdAt)', async () => {
    const st = roundStamp();
    const snapshot = ctx.store.state;
    await ctx.store.replaceAll(snapshot); // a restore of this device's own backup keeps meta.createdAt
    expect(gradeFlash('fl-g-001', 'right', undefined, false, st)).toBe(false);
    expect(srs()).toEqual({});
    const st2 = roundStamp();
    await ctx.store.replaceAll(emptyState(42)); // reset
    expect(gradeFlash('fl-g-001', 'right', undefined, false, st2)).toBe(false);
    expect(ctx.store.state.flash).toEqual({ srs: {}, days: [] });
  });
});

describe('counts and rounds', () => {
  it('ignores stored entries for facts no longer in the bank', () => {
    ctx.store.set('flash', { srs: { 'fl-x-999': { box: 0, due: '2020-01-01', last: 1 }, 'fl-g-001': { box: 3, due: '2020-01-01', last: 1 } }, days: [] });
    const c = flashCounts(bank, ctx.store.state);
    expect(c).toMatchObject({ total: FLASH.length, practiced: 1, due: 1, mastered: 1, fresh: FLASH.length - 1 });
    expect(buildRound(bank, ctx.store.state, 20).map((x) => x.id)).not.toContain('fl-x-999');
  });
  it('one fact per card when the pool allows, due first, no back-to-back cards when avoidable', () => {
    ctx.store.set('flash', { srs: { 'fl-g-002': { box: 1, due: '2020-01-01', last: 1 } }, days: [] });
    const r = buildRound(bank, ctx.store.state, 7, '', () => 0.3);
    const card = (id: string) => FLASH.find((f) => f.id === id)!.card;
    expect(new Set(r.map((x) => card(x.id))).size).toBe(7);
    expect(r.map((x) => x.id)).toContain('fl-g-002'); // the due one is in
    expect(r.map((x) => x.id)).not.toContain('fl-g-001'); // its card is already used
    const full = buildRound(bank, ctx.store.state, 20, '', () => 0.3);
    expect(full).toHaveLength(FLASH.length); // a small pool: a shorter round, second facts from a card allowed
    for (let i = 1; i < full.length; i++) expect(card(full[i].id)).not.toBe(card(full[i - 1].id));
  });
  it('never puts two facts from one card next to each other when another card is left (any shuffle)', () => {
    const k = (id: string, card: string) => fact(id, 'K', card);
    const small: Bank = { ...bank, flash: [k('fl-k-001', 'cx'), k('fl-k-002', 'cx'), k('fl-k-003', 'cx'), k('fl-k-004', 'cy'), k('fl-k-005', 'cz')] };
    const card = (id: string) => small.flash!.find((f) => f.id === id)!.card;
    for (let seed = 0; seed < 40; seed++) {
      let x = seed + 1; const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      const r = buildRound(small, ctx.store.state, 5, 'K', rand).map((f) => card(f.id));
      expect(r).toHaveLength(5);
      for (let i = 1; i < r.length; i++) expect(r[i], `seed ${seed}: ${r.join(' ')}`).not.toBe(r[i - 1]);
    }
  });
  it('filters by knowledge group and tops up with practice ahead', () => {
    ctx.store.set('flash', { srs: { 'fl-i-001': { box: 2, due: addDays(ymd(), 3), last: 1 } }, days: [] });
    const r = buildRound(bank, ctx.store.state, 10, 'I');
    expect(r.map((x) => x.id).sort()).toEqual(['fl-i-001', 'fl-i-002', 'fl-i-003']);
    expect(r.find((x) => x.id === 'fl-i-001')!.ahead).toBe(true);
    expect(r.filter((x) => x.ahead)).toHaveLength(1);
  });
  it('final days: practised facts only, and an empty round when none are', () => {
    ctx.store.updateSettings({ examDate: addDays(ymd(), 1) });
    expect(buildRound(bank, ctx.store.state, 10)).toEqual([]);
    ctx.store.set('flash', { srs: { 'fl-e-001': { box: 1, due: addDays(ymd(), 1), last: 1 } }, days: [] });
    expect(buildRound(bank, ctx.store.state, 10).map((x) => x.id)).toEqual(['fl-e-001']);
  });
  it('flash days count toward the study streak', () => {
    const d = ymd();
    expect(studyDays({ ...ctx.store.state, attempts: [], cardSrs: {}, meta: { ...ctx.store.state.meta, days: [] }, flash: { srs: {}, days: [d] } }).has(d)).toBe(true);
    expect(studyDays({ ...legacyState(), flash: undefined } as unknown as DbState).size).toBeGreaterThan(0); // an old state shape doesn't crash
  });
});

describe('backups', () => {
  it('a v1.3.0 backup restores as before, with empty flash progress', () => {
    const legacy = legacyState();
    const file = JSON.stringify({ app: 'cmpc-prep', kind: 'backup', schema: 1, exportedAt: 'x', appVersion: '1.3.0', contentVersion: 'v', state: legacy });
    const b = parseBackup(file);
    const { flash, ...rest } = b.state;
    expect(rest).toEqual({ ...legacy });
    expect(flash).toEqual({ srs: {}, days: [] });
    expect(b.flashUnreadable).toBeUndefined();
    expect(summarize(b.state)).toEqual({ attempts: 2, exams: 0, sessions: 0, reviews: 2, reports: 1, flash: 0 });
  });
  it('a damaged flash part still restores everything else, and flash starts fresh', () => {
    const legacy = legacyState();
    const b = parseBackup(JSON.stringify({ app: 'cmpc-prep', kind: 'backup', schema: 1, exportedAt: 'x', appVersion: '1.4.0', contentVersion: 'v', state: { ...legacy, flash: { srs: { a: null, 'fl-g-001': { box: 2, due: '2026-01-01', last: 1 } }, days: ['2026-01-01'] } } }));
    expect(b.flashUnreadable).toBe(true);
    expect(b.state.flash).toEqual({ srs: {}, days: [] });
    expect(b.state.attempts).toEqual(legacy.attempts);
  });
  it('round-trips flash progress, counted apart from review entries', () => {
    gradeFlash('fl-g-001', 'wrong', undefined, false, roundStamp());
    const b = parseBackup(JSON.stringify(makeBackup(ctx.store.state, '1.4.0', 'v')));
    expect(b.state).toEqual(ctx.store.state);
    expect(summarize(b.state)).toMatchObject({ reviews: 2, flash: 1 });
  });
  it('reset clears flash progress', async () => {
    gradeFlash('fl-g-001', 'right', undefined, false, roundStamp());
    await ctx.store.replaceAll(emptyState());
    expect(ctx.store.state.flash).toEqual({ srs: {}, days: [] });
  });
  it('cleanFlash keeps only well-formed entries', () => {
    expect(cleanFlash(undefined)).toEqual({ flash: { srs: {}, days: [] }, ok: true });
    expect(cleanFlash([]).ok).toBe(false);
    expect(cleanFlash({ srs: { a: { box: 1, due: 'soon', last: 1 } }, days: [] })).toEqual({ flash: { srs: {}, days: [] }, ok: false });
  });
});
