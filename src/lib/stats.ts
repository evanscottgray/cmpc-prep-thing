import type { Attempt, Bank, DbState, DomainId, Item, KgId } from '../types';
import { scaledScore } from './scoring';

export interface ItemStat { n: number; c: number; first: boolean | null; last: boolean | null; lastAt: number; unsure: boolean }

export function itemStats(attempts: Attempt[]): Map<string, ItemStat> {
  const m = new Map<string, ItemStat>();
  for (const a of attempts) {
    let s = m.get(a.i);
    if (!s) { s = { n: 0, c: 0, first: a.ok, last: null, lastAt: 0, unsure: false }; m.set(a.i, s); }
    s.n++; if (a.ok) s.c++;
    if (a.t >= s.lastAt) { s.last = a.ok; s.lastAt = a.t; s.unsure = !!a.unsure; }
  }
  return m;
}

export interface Acc { c: number; n: number }
const PRIOR_P = 0.6, PRIOR_K = 4;
/** Smoothed accuracy (shrinks toward 60% when there is little data). */
export const smooth = (a: Acc) => (a.c + PRIOR_P * PRIOR_K) / (a.n + PRIOR_K);
export const pct = (a: Acc) => (a.n ? Math.round((100 * a.c) / a.n) : null);

/** Accuracy by area using each item's FIRST attempt (best estimate for unseen exam items) or LAST attempt (mastery). */
export function areaAccuracy(bank: Bank, stats: Map<string, ItemStat>, which: 'first' | 'last') {
  const byDomain: Record<string, Acc> = {}, byKg: Record<string, Acc> = {}, byCell: Record<string, Acc> = {};
  for (const d of bank.blueprint.domains) byDomain[d.id] = { c: 0, n: 0 };
  for (const k of bank.blueprint.kgs) byKg[k.id] = { c: 0, n: 0 };
  const byId = new Map(bank.items.map((i) => [i.id, i]));
  for (const [id, s] of stats) {
    const it = byId.get(id); if (!it) continue;
    const v = which === 'first' ? s.first : s.last;
    if (v === null) continue;
    const ok = v ? 1 : 0;
    byDomain[it.domain].n++; byDomain[it.domain].c += ok;
    byKg[it.kg].n++; byKg[it.kg].c += ok;
    const key = `${it.kg}|${it.domain}`;
    (byCell[key] ??= { c: 0, n: 0 }).n++; byCell[key].c += ok;
  }
  return { byDomain, byKg, byCell };
}

/** Blueprint-weighted accuracy (domain weights). */
export function weightedAccuracy(bank: Bank, byDomain: Record<string, Acc>, smoothed = false): number | null {
  let w = 0, sum = 0;
  for (const d of bank.blueprint.domains) {
    const a = byDomain[d.id];
    if (!smoothed && !a?.n) continue;
    w += d.weight; sum += d.weight * (smoothed ? smooth(a) : a.c / a.n);
  }
  return w ? sum / w : null;
}

/** Readiness estimate: blueprint-weighted, smoothed first-attempt accuracy → estimated raw and scaled score. */
export function readiness(bank: Bank, db: DbState) {
  const stats = itemStats(db.attempts);
  const { byDomain } = areaAccuracy(bank, stats, 'first');
  const n = Object.values(byDomain).reduce((s, a) => s + a.n, 0);
  const p = weightedAccuracy(bank, byDomain, true) ?? PRIOR_P;
  const se = n ? Math.sqrt((p * (1 - p)) / n) : 0.2;
  const raw = Math.round(p * 100);
  const lo = Math.max(0, Math.round((p - 1.64 * se) * 100)), hi = Math.min(100, Math.round((p + 1.64 * se) * 100));
  const target = db.settings.rawTarget;
  const scaledLo = scaledScore(lo, target), scaledHi = scaledScore(hi, target);
  return {
    n, raw, lo, hi, scaled: scaledScore(raw, target), scaledLo, scaledHi,
    enough: n >= 60,
    // one rule for the label and its explanation: where the likely range sits against 550
    level: n < 60 ? 'Not enough data yet' : scaledLo >= 550 ? 'On track' : scaledHi < 550 ? 'Needs work' : 'Borderline',
  };
}

/** Weight for each grid cell: blueprint weight × (1 − smoothed accuracy). Used to target weak areas. */
export function cellWeakness(bank: Bank, stats: Map<string, ItemStat>): Map<string, number> {
  const { byCell } = areaAccuracy(bank, stats, 'last');
  const out = new Map<string, number>();
  for (const k of bank.blueprint.kgs) for (const d of bank.blueprint.domains) {
    const g = bank.blueprint.grid[k.id as KgId][d.id as DomainId];
    if (!g) continue;
    const key = `${k.id}|${d.id}`;
    out.set(key, g * (1 - smooth(byCell[key] ?? { c: 0, n: 0 })));
  }
  return out;
}

export function todayCount(db: DbState, now = Date.now()): number {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  let n = 0; for (let i = db.attempts.length - 1; i >= 0; i--) { if (db.attempts[i].t < t0) break; if (!db.attempts[i].na) n++; }
  return n;
}

export function pacingStats(db: DbState) {
  const timed = db.attempts.filter((a) => (a.src === 'exam' || a.src === 'block' || a.src === 'timed') && a.ms);
  if (!timed.length) return null;
  const avg = timed.reduce((s, a) => s + (a.ms || 0), 0) / timed.length / 1000;
  return { avgSec: Math.round(avg), n: timed.length };
}

/** Knowledge groups to study next: blueprint weight × smoothed error rate, among groups with answers and below 85%. */
export function focusAreas(bank: Bank, byKg: Record<string, Acc>, max = 3) {
  return bank.blueprint.kgs
    .filter((k) => byKg[k.id]?.n && byKg[k.id].c / byKg[k.id].n < 0.85)
    .map((k) => ({ ...k, acc: byKg[k.id], need: k.weight * (1 - smooth(byKg[k.id])) }))
    .sort((a, b) => b.need - a.need).slice(0, max);
}

/** The ranking quantity itself, so the order can be checked: about how many of 100 exam points this group is costing. */
export const focusLine = (k: { acc: Acc; weight: number; need: number }) => `About ${Math.max(1, Math.round(k.need))} ${Math.round(k.need) <= 1 ? 'point' : 'points'} lost · ${k.acc.n - k.acc.c} of ${k.acc.n} missed · ${k.weight}% of exam`;

export function examHistory(db: DbState) {
  return Object.values(db.sessions)
    .filter((s) => s.status === 'submitted' && s.result && (s.kind === 'formA' || s.kind === 'formB' || s.kind === 'mixed'))
    .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
}

export function formTaken(db: DbState, kind: 'formA' | 'formB' | 'mixed'): boolean {
  return Object.values(db.sessions).some((s) => s.kind === kind && s.status === 'submitted');
}

/** Items the learner may see in drills: drill pool + items of forms already taken, minus hidden. */
export function availableItems(bank: Bank, db: DbState): Item[] {
  const hidden = new Set(db.hidden);
  const a = formTaken(db, 'formA'), b = formTaken(db, 'formB');
  return bank.items.filter((i) => !hidden.has(i.id) && (i.pool === 'drill' || (i.pool === 'A' && a) || (i.pool === 'B' && b)));
}
