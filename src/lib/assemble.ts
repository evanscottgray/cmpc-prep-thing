import type { Bank, DbState, DomainId, ExamMode, Item, KgId, Session, SessionItem, SessionKind } from '../types';
import { rng, shuffle, uid } from './rng';
import { availableItems, cellWeakness, formTaken, itemStats, type ItemStat } from './stats';

export type DrillSource =
  | { type: 'weak' } | { type: 'domain'; id: DomainId } | { type: 'kg'; id: KgId }
  | { type: 'missed' } | { type: 'flagged' } | { type: 'unseen' } | { type: 'all' };

const cellKey = (i: Item) => `${i.kg}|${i.domain}`;
const DAY = 86400000;

/** Selection priority: prefer unseen, previously missed/unsure, weak cells; avoid very recent repeats. */
function priority(i: Item, st: ItemStat | undefined, weak: Map<string, number>, maxWeak: number, now: number, rand: () => number) {
  let p = rand();
  if (!st) p += 2;
  else {
    if (st.last === false) p += 1.5;
    if (st.unsure) p += 1;
    if (now - st.lastAt < 2 * DAY) p -= 1.5;
  }
  p += maxWeak > 0 ? (weak.get(cellKey(i)) ?? 0) / maxWeak : 0;
  return p;
}

function newSession(kind: SessionKind, title: string, items: SessionItem[], opts: { timed: boolean; durationMs: number; mode: ExamMode; retake?: boolean; seenBefore?: number; label?: string }, now: number): Session {
  return {
    id: uid(kind + '-'), kind, title, createdAt: now, timed: opts.timed, mode: opts.timed ? opts.mode : 'coached',
    durationMs: opts.durationMs, startedAt: null, pausedAt: null, pausedMs: 0, items,
    responses: {}, flags: [], strikes: {}, unsure: [], revealed: [], timeOnItem: {}, current: 0, visitAt: null,
    status: 'active', submittedAt: null, autoSubmitted: false, retake: !!opts.retake, seenBefore: opts.seenBefore ?? 0, result: null, label: opts.label,
  };
}
function toSessionItems(list: { id: string; scored: boolean }[], rand: () => number): SessionItem[] {
  return list.map((x) => ({ id: x.id, scored: x.scored, order: shuffle([0, 1, 2, 3], rand) }));
}

/** Form A / Form B: the fixed 115 items (100 scored + 15 unscored), order and options shuffled per sitting.
 *  A hidden item is swapped for an available drill item from the same grid cell so the form still matches the grid. */
export function buildForm(bank: Bank, db: DbState, form: 'A' | 'B', mode: ExamMode, now = Date.now(), seed = now): Session {
  const rand = rng(seed);
  const hidden = new Set(db.hidden);
  const stats = itemStats(db.attempts);
  const formItems = bank.items.filter((i) => i.pool === form);
  const used = new Set(formItems.map((i) => i.id));
  const spare = bank.items.filter((i) => i.pool === 'drill' && !hidden.has(i.id));
  const list = formItems.map((i) => {
    if (!hidden.has(i.id)) return { id: i.id, scored: i.scored };
    const sub = spare.filter((s) => !used.has(s.id) && cellKey(s) === cellKey(i)).sort((a, b) => (stats.has(a.id) ? 1 : 0) - (stats.has(b.id) ? 1 : 0))[0]
      ?? spare.find((s) => !used.has(s.id) && s.domain === i.domain);
    if (!sub) return { id: i.id, scored: i.scored };
    used.add(sub.id);
    return { id: sub.id, scored: i.scored };
  });
  const kind = form === 'A' ? 'formA' : 'formB';
  const exposed = new Set(db.meta.exposed ?? []);
  const seenBefore = list.filter((x) => stats.has(x.id) || exposed.has(x.id)).length;
  return newSession(kind, `Form ${form}`, toSessionItems(shuffle(list, rand), rand), {
    timed: true, durationMs: bank.blueprint.exam.minutes * 60000, mode, retake: formTaken(db, kind) || list.some((x) => exposed.has(x.id)), seenBefore,
  }, now);
}

/** Mixed exam: assembled to the grid from available items (drill pool + forms already taken), favoring unseen and weak areas. */
export function buildMixed(bank: Bank, db: DbState, mode: ExamMode, now = Date.now(), seed = now): Session {
  const rand = rng(seed);
  const stats = itemStats(db.attempts);
  const weak = cellWeakness(bank, stats);
  const maxWeak = Math.max(0, ...weak.values());
  const pool = availableItems(bank, db);
  const pr = new Map(pool.map((i) => [i.id, priority(i, stats.get(i.id), weak, maxWeak, now, rand)]));
  const byPr = (a: Item, b: Item) => (pr.get(b.id)! - pr.get(a.id)!);
  const chosen = new Set<string>();
  const list: { id: string; scored: boolean }[] = [];
  const g = bank.blueprint.grid;
  for (const k of bank.blueprint.kgs) for (const d of bank.blueprint.domains) {
    const need = g[k.id][d.id];
    if (!need) continue;
    let cands = pool.filter((i) => i.kg === k.id && i.domain === d.id && !chosen.has(i.id)).sort(byPr);
    if (cands.length < need) cands = cands.concat(pool.filter((i) => !chosen.has(i.id) && !cands.includes(i) && (i.kg === k.id || i.domain === d.id)).sort(byPr));
    for (const i of cands.slice(0, need)) { chosen.add(i.id); list.push({ id: i.id, scored: true }); }
  }
  for (const d of bank.blueprint.domains) {
    const need = bank.blueprint.unscoredPerForm[d.id];
    let cands = pool.filter((i) => i.domain === d.id && !chosen.has(i.id)).sort(byPr);
    if (cands.length < need) cands = cands.concat(pool.filter((i) => !chosen.has(i.id) && i.domain !== d.id).sort(byPr));
    for (const i of cands.slice(0, need)) { chosen.add(i.id); list.push({ id: i.id, scored: false }); }
  }
  const exposed = new Set(db.meta.exposed ?? []);
  const seenBefore = list.filter((x) => stats.has(x.id) || exposed.has(x.id)).length;
  return newSession('mixed', 'Mixed exam', toSessionItems(shuffle(list, rand), rand), {
    timed: true, durationMs: bank.blueprint.exam.minutes * 60000, mode, retake: seenBefore > 0, seenBefore,
  }, now);
}

/** Apportion `count` items over grid cells in proportion to the blueprint (randomized largest-remainder). */
function apportion(bank: Bank, count: number, rand: () => number, weights?: Map<string, number>): Map<string, number> {
  const cells: { key: string; w: number }[] = [];
  for (const k of bank.blueprint.kgs) for (const d of bank.blueprint.domains) {
    const key = `${k.id}|${d.id}`;
    const w = weights ? (weights.get(key) ?? 0) : bank.blueprint.grid[k.id][d.id];
    if (w > 0) cells.push({ key, w });
  }
  const total = cells.reduce((s, c) => s + c.w, 0);
  const out = new Map<string, number>();
  let assigned = 0;
  const rem: { key: string; r: number }[] = [];
  for (const c of cells) {
    const q = (c.w / total) * count;
    out.set(c.key, Math.floor(q)); assigned += Math.floor(q);
    rem.push({ key: c.key, r: q - Math.floor(q) });
  }
  // distribute the rest, weighted-random by remainder
  while (assigned < count && rem.length) {
    const sum = rem.reduce((s, x) => s + x.r + 1e-6, 0);
    let pick = rand() * sum, idx = 0;
    for (; idx < rem.length - 1; idx++) { pick -= rem[idx].r + 1e-6; if (pick <= 0) break; }
    const [c] = rem.splice(idx, 1);
    out.set(c.key, (out.get(c.key) ?? 0) + 1); assigned++;
  }
  return out;
}

function sampleProportional(bank: Bank, pool: Item[], count: number, prOf: (i: Item) => number, rand: () => number, weights?: Map<string, number>): Item[] {
  const quotas = apportion(bank, count, rand, weights);
  const chosen: Item[] = [];
  const taken = new Set<string>();
  const sorted = pool.slice().sort((a, b) => prOf(b) - prOf(a));
  for (const [key, n] of quotas) {
    for (const i of sorted) { if (chosen.length >= count) break; if (n <= chosen.filter((c) => cellKey(c) === key).length) break; if (cellKey(i) === key && !taken.has(i.id)) { chosen.push(i); taken.add(i.id); } }
  }
  for (const i of sorted) { if (chosen.length >= count) break; if (!taken.has(i.id)) { chosen.push(i); taken.add(i.id); } }
  return shuffle(chosen, rand);
}

export function flaggedIds(db: DbState): Set<string> {
  const out = new Set<string>();
  for (const s of Object.values(db.sessions)) if (s.status === 'submitted') for (const pos of s.flags) out.add(s.items[pos]?.id);
  out.delete(undefined as unknown as string);
  return out;
}

export function drillPool(bank: Bank, db: DbState, src: DrillSource): Item[] {
  const stats = itemStats(db.attempts);
  const pool = availableItems(bank, db);
  switch (src.type) {
    case 'domain': return pool.filter((i) => i.domain === src.id);
    case 'kg': return pool.filter((i) => i.kg === src.id);
    case 'missed': return pool.filter((i) => stats.get(i.id)?.last === false);
    case 'flagged': { const f = flaggedIds(db); return pool.filter((i) => f.has(i.id)); }
    case 'unseen': return pool.filter((i) => !stats.has(i.id));
    default: return pool;
  }
}

export function sourceLabel(bank: Bank, src: DrillSource): string {
  switch (src.type) {
    case 'weak': return 'Weakest areas';
    case 'domain': return `Domain ${src.id}: ${bank.blueprint.domains.find((d) => d.id === src.id)?.name}`;
    case 'kg': return `Knowledge group ${src.id}: ${bank.blueprint.kgs.find((k) => k.id === src.id)?.name}`;
    case 'missed': return 'Missed questions';
    case 'flagged': return 'Flagged questions';
    case 'unseen': return 'Unseen questions';
    default: return 'All available questions';
  }
}

/** Drill (tutor or timed at exam pace). */
export function buildDrill(bank: Bank, db: DbState, src: DrillSource, count: number, timed: boolean, now = Date.now(), seed = now, kind: SessionKind = timed ? 'timed' : 'drill', title?: string): Session | null {
  const rand = rng(seed);
  const stats = itemStats(db.attempts);
  const weak = cellWeakness(bank, stats);
  const maxWeak = Math.max(0, ...weak.values());
  const pool = drillPool(bank, db, src);
  if (!pool.length) return null;
  const pr = new Map(pool.map((i) => [i.id, priority(i, stats.get(i.id), weak, maxWeak, now, rand)]));
  const prOf = (i: Item) => pr.get(i.id)!;
  let picked: Item[];
  if (src.type === 'weak') picked = sampleProportional(bank, pool, Math.min(count, pool.length), prOf, rand, weak);
  else picked = shuffle(pool.slice().sort((a, b) => prOf(b) - prOf(a)).slice(0, count), rand);
  const n = picked.length;
  const name = src.type === 'domain' ? bank.blueprint.domains.find((d) => d.id === src.id)?.name : src.type === 'kg' ? bank.blueprint.kgs.find((k) => k.id === src.id)?.name : sourceLabel(bank, src);
  return newSession(kind, title ?? `${name}${timed ? ' (timed)' : ''}`, toSessionItems(picked.map((i) => ({ id: i.id, scored: true })), rand), {
    timed, durationMs: timed ? n * bank.blueprint.exam.secondsPerItem * 1000 : 0, mode: 'strict', label: sourceLabel(bank, src),
    seenBefore: picked.filter((i) => stats.has(i.id)).length,
  }, now);
}

/** Exam-pace block: 23 items in 18 minutes, sampled in proportion to the blueprint. */
export function buildBlock(bank: Bank, db: DbState, mode: ExamMode, now = Date.now(), seed = now): Session {
  const rand = rng(seed);
  const stats = itemStats(db.attempts);
  const weak = cellWeakness(bank, stats);
  const maxWeak = Math.max(0, ...weak.values());
  const pool = availableItems(bank, db);
  const pr = new Map(pool.map((i) => [i.id, priority(i, stats.get(i.id), weak, maxWeak, now, rand)]));
  const picked = sampleProportional(bank, pool, 23, (i) => pr.get(i.id)!, rand);
  return newSession('block', 'Exam-pace block', toSessionItems(picked.map((i) => ({ id: i.id, scored: true })), rand), {
    timed: true, durationMs: 18 * 60000, mode, label: '23 questions in 18 minutes', seenBefore: picked.filter((i) => stats.has(i.id)).length,
  }, now);
}

/** Quick quiz: 10 blueprint-weighted items in tutor mode. */
export function buildQuiz(bank: Bank, db: DbState, now = Date.now(), seed = now): Session {
  const rand = rng(seed);
  const stats = itemStats(db.attempts);
  const weak = cellWeakness(bank, stats);
  const maxWeak = Math.max(0, ...weak.values());
  const pool = availableItems(bank, db);
  const pr = new Map(pool.map((i) => [i.id, priority(i, stats.get(i.id), weak, maxWeak, now, rand)]));
  const picked = sampleProportional(bank, pool, 10, (i) => pr.get(i.id)!, rand, weak);
  return newSession('quiz', 'Quick quiz', toSessionItems(picked.map((i) => ({ id: i.id, scored: true })), rand), {
    timed: false, durationMs: 0, mode: 'coached', label: db.attempts.length ? 'Weighted to weak areas' : 'Untimed warm-up', // nothing to weight yet on the very first one
  }, now);
}

/** Spaced review of due items (tutor mode). */
export const REVIEW_MAX = 25;
export function buildReview(bank: Bank, db: DbState, dueIds: string[], max = REVIEW_MAX, now = Date.now(), seed = now): Session | null {
  const rand = rng(seed);
  const hidden = new Set(db.hidden);
  const ids = dueIds.filter((id) => !hidden.has(id) && bank.items.some((i) => i.id === id)).slice(0, max);
  if (!ids.length) return null;
  return newSession('review', 'Spaced review', toSessionItems(shuffle(ids, rand).map((id) => ({ id, scored: true })), rand), {
    timed: false, durationMs: 0, mode: 'coached', label: 'Missed and uncertain questions due today',
  }, now);
}
