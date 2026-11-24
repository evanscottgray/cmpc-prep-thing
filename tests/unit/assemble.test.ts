import { describe, it, expect } from 'vitest';
import { buildForm, buildMixed, buildBlock, buildDrill, buildQuiz } from '../../src/lib/assemble';
import { emptyState } from '../../src/lib/store';
import { availableItems } from '../../src/lib/stats';
import { loadBank, cellCounts } from './helpers';
import type { DbState } from '../../src/types';

const bank = loadBank();
const gridOf = () => {
  const m: Record<string, number> = {};
  for (const k of bank.blueprint.kgs) for (const d of bank.blueprint.domains) if (bank.blueprint.grid[k.id][d.id]) m[`${k.id}|${d.id}`] = bank.blueprint.grid[k.id][d.id];
  return m;
};
const scoredIds = (s: { items: { id: string; scored: boolean }[] }) => s.items.filter((x) => x.scored).map((x) => x.id);
const takeForm = (db: DbState, kind: 'formA' | 'formB') => {
  const s = buildForm(bank, db, kind === 'formA' ? 'A' : 'B', 'strict', 1, 1);
  db.sessions[s.id] = { ...s, status: 'submitted', submittedAt: 2 };
};

describe('forms', () => {
  for (const f of ['A', 'B'] as const) {
    it(`Form ${f}: 115 items, 100 scored matching the grid exactly, 15 unscored`, () => {
      const s = buildForm(bank, emptyState(), f, 'strict', 1, 42);
      expect(s.items).toHaveLength(115);
      expect(s.items.filter((x) => !x.scored)).toHaveLength(15);
      expect(cellCounts(bank, scoredIds(s))).toEqual(gridOf());
      expect(s.durationMs).toBe(90 * 60000);
      for (const it of s.items) expect([...it.order].sort()).toEqual([0, 1, 2, 3]);
    });
  }
  it('forms share no items', () => {
    const a = new Set(bank.items.filter((i) => i.pool === 'A').map((i) => i.id));
    expect(bank.items.filter((i) => i.pool === 'B').some((i) => a.has(i.id))).toBe(false);
  });
  it('shuffles item and option order per sitting', () => {
    const s1 = buildForm(bank, emptyState(), 'A', 'strict', 1, 1), s2 = buildForm(bank, emptyState(), 'A', 'strict', 1, 2);
    expect(s1.items.map((x) => x.id)).not.toEqual(s2.items.map((x) => x.id));
    expect(new Set(s1.items.map((x) => x.id))).toEqual(new Set(s2.items.map((x) => x.id)));
  });
  it('swaps a hidden form item for a drill item from the same cell, keeping the grid', () => {
    const db = emptyState();
    const victim = bank.items.find((i) => i.pool === 'A' && i.scored)!;
    db.hidden = [victim.id];
    const s = buildForm(bank, db, 'A', 'strict', 1, 3);
    expect(s.items.some((x) => x.id === victim.id)).toBe(false);
    expect(cellCounts(bank, scoredIds(s))).toEqual(gridOf());
  });
  it('labels a second sitting as a retake', () => {
    const db = emptyState(); takeForm(db, 'formA');
    expect(buildForm(bank, db, 'A', 'strict', 3, 3).retake).toBe(true);
  });
});

describe('unseen forms stay unseen', () => {
  it('drill pool excludes untaken forms, includes taken ones', () => {
    const db = emptyState();
    expect(availableItems(bank, db).every((i) => i.pool === 'drill')).toBe(true);
    takeForm(db, 'formA');
    const pools = new Set(availableItems(bank, db).map((i) => i.pool));
    expect(pools.has('A')).toBe(true);
    expect(pools.has('B')).toBe(false);
  });
});

describe('mixed exam', () => {
  it('matches the grid from drill items alone, with 15 unscored, no form items', () => {
    const s = buildMixed(bank, emptyState(), 'strict', 1, 7);
    expect(s.items).toHaveLength(115);
    expect(new Set(s.items.map((x) => x.id)).size).toBe(115);
    expect(cellCounts(bank, scoredIds(s))).toEqual(gridOf());
    const by = new Map(bank.items.map((i) => [i.id, i]));
    expect(s.items.every((x) => by.get(x.id)!.pool === 'drill')).toBe(true);
    const unscoredDomains: Record<string, number> = {};
    for (const x of s.items.filter((y) => !y.scored)) unscoredDomains[by.get(x.id)!.domain] = (unscoredDomains[by.get(x.id)!.domain] || 0) + 1;
    expect(unscoredDomains).toEqual(bank.blueprint.unscoredPerForm);
  });
  it('favors unseen items', () => {
    const db = emptyState();
    const drill = bank.items.filter((i) => i.pool === 'drill');
    // mark half of every cell's drill items as seen (answered correctly, long ago)
    const seen = drill.filter((_, i) => i % 2 === 0);
    db.attempts = seen.map((i) => ({ i: i.id, t: 1, ok: true, src: 'drill' as const }));
    const s = buildMixed(bank, db, 'strict', 10 * 86400000, 9);
    const seenSet = new Set(seen.map((i) => i.id));
    const seenCount = s.items.filter((x) => seenSet.has(x.id)).length;
    expect(seenCount).toBeLessThan(115 - seenCount);
    expect(s.seenBefore).toBe(seenCount);
    expect(s.retake).toBe(seenCount > 0);
  });
});

describe('blocks, drills, quiz', () => {
  it('exam-pace block: 23 items, 18 minutes, roughly proportional by domain', () => {
    const s = buildBlock(bank, emptyState(), 'strict', 1, 5);
    expect(s.items).toHaveLength(23);
    expect(s.durationMs).toBe(18 * 60000);
    const by = new Map(bank.items.map((i) => [i.id, i]));
    const iv = s.items.filter((x) => by.get(x.id)!.domain === 'IV').length;
    expect(iv).toBeGreaterThanOrEqual(5);
    expect(iv).toBeLessThanOrEqual(9);
  });
  it('domain drill only returns that domain; timed drill runs at 47 s/item', () => {
    const s = buildDrill(bank, emptyState(), { type: 'domain', id: 'V' }, 10, true, 1, 1)!;
    const by = new Map(bank.items.map((i) => [i.id, i]));
    expect(s.items.every((x) => by.get(x.id)!.domain === 'V')).toBe(true);
    expect(s.durationMs).toBe(s.items.length * 47000);
  });
  it('missed drill returns only items last answered wrong', () => {
    const db = emptyState();
    const d = bank.items.filter((i) => i.pool === 'drill');
    db.attempts = [{ i: d[0].id, t: 1, ok: false, src: 'drill' }, { i: d[1].id, t: 1, ok: true, src: 'drill' }, { i: d[2].id, t: 1, ok: false, src: 'drill' }, { i: d[2].id, t: 2, ok: true, src: 'drill' }];
    const s = buildDrill(bank, db, { type: 'missed' }, 10, false, 3, 3)!;
    expect(s.items.map((x) => x.id)).toEqual([d[0].id]);
  });
  it('weak-area drill concentrates on weak cells', () => {
    const db = emptyState();
    // fail everything in KG E, ace everything in KG I
    db.attempts = bank.items.filter((i) => i.pool === 'drill' && (i.kg === 'E' || i.kg === 'I')).map((i) => ({ i: i.id, t: 1, ok: i.kg === 'I', src: 'drill' as const }));
    const s = buildDrill(bank, db, { type: 'weak' }, 30, false, 5 * 86400000, 11)!;
    const by = new Map(bank.items.map((i) => [i.id, i]));
    const e = s.items.filter((x) => by.get(x.id)!.kg === 'E').length;
    const i = s.items.filter((x) => by.get(x.id)!.kg === 'I').length;
    expect(e).toBeGreaterThan(i);
  });
  it('quick quiz has 10 items', () => {
    expect(buildQuiz(bank, emptyState(), 1, 1).items).toHaveLength(10);
    expect(buildQuiz(bank, emptyState(), 1, 1).label).toBe('Untimed warm-up'); // the very first quiz has nothing to weight yet
    const db = emptyState(); db.attempts = [{ i: bank.items[0].id, t: 1, ok: true, src: 'quiz' }];
    expect(buildQuiz(bank, db, 2, 2).label).toBe('Weighted to weak areas');
  });
});
