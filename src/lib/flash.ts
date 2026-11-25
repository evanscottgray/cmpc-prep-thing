import type { Bank, DbState, Flash, KgId, SrsEntry } from '../types';
import { ctx } from '../ctx';
import { ymd } from './dates';
import { dueIds, scheduleCard, type Grade } from './srs';
import { areaAccuracy, itemStats, smooth } from './stats';
import { isLight, plan } from './plan';
import { shuffle } from './rng';

// Flash drill: short fact questions with their own progress (`db.flash`). Nothing here reads or writes
// attempts, sessions, srs, cardSrs, settings or meta, so exam scores and readiness can't change.

export const MASTERED = 3; // review level counted as mastered
export const flashBank = (bank: Bank): Flash[] => bank.flash ?? [];

/** Entries for facts that are still in the bank (removed facts stay stored but are ignored). */
function liveSrs(bank: Bank, db: DbState): Record<string, SrsEntry> {
  const ids = new Set(flashBank(bank).map((f) => f.id));
  return Object.fromEntries(Object.entries(db.flash.srs).filter(([id]) => ids.has(id)));
}

export function flashCounts(bank: Bank, db: DbState, today = ymd(), kg?: KgId | '') {
  const facts = flashBank(bank).filter((f) => !kg || f.kg === kg);
  const ids = new Set(facts.map((f) => f.id));
  const srs = Object.fromEntries(Object.entries(liveSrs(bank, db)).filter(([id]) => ids.has(id)));
  const practiced = Object.keys(srs).length;
  return {
    total: facts.length,
    practiced,
    fresh: facts.length - practiced,
    due: dueIds(srs, today, db.settings.examDate).length,
    mastered: Object.values(srs).filter((e) => e.box >= MASTERED).length,
  };
}

export interface RoundFact { id: string; ahead: boolean } // ahead: practiced but not yet due, so a right answer doesn't raise its level

/**
 * The facts for one round: due first, then new (heaviest and weakest knowledge groups first), then practice ahead.
 * At most one fact per card unless the pool is too small; never two from the same card in a row when avoidable.
 * In the final days (taper, exam day) only practiced facts are used.
 */
export function buildRound(bank: Bank, db: DbState, n: number, kg: KgId | '' = '', rand = Math.random, now = Date.now()): RoundFact[] {
  const today = ymd(now);
  const facts = flashBank(bank).filter((f) => !kg || f.kg === kg);
  const byId = new Map(facts.map((f) => [f.id, f]));
  const srs = Object.fromEntries(Object.entries(liveSrs(bank, db)).filter(([id]) => byId.has(id)));
  const due = dueIds(srs, today, db.settings.examDate);
  const dueSet = new Set(due);
  const light = isLight(plan(db, now).phase);
  const { byKg } = areaAccuracy(bank, itemStats(db.attempts), 'last');
  const weight = (f: Flash) => (bank.blueprint.kgs.find((k) => k.id === f.kg)?.weight ?? 1) * (1 - smooth(byKg[f.kg] ?? { c: 0, n: 0 })) * (0.6 + rand() * 0.8);
  const fresh = light ? [] : facts.filter((f) => !srs[f.id]).map((f) => ({ f, w: weight(f) })).sort((a, b) => b.w - a.w).map((x) => x.f.id);
  const ahead = Object.entries(srs).filter(([id]) => !dueSet.has(id)).sort((a, b) => a[1].due.localeCompare(b[1].due) || a[1].box - b[1].box).map(([id]) => id);
  const order = [...due, ...fresh, ...ahead];

  const picked: string[] = [];
  const cards = new Set<string>();
  for (const id of order) { if (picked.length >= n) break; const c = byId.get(id)!.card; if (!cards.has(c)) { picked.push(id); cards.add(c); } }
  for (const id of order) { if (picked.length >= n) break; if (!picked.includes(id)) picked.push(id); } // a small pool: allow a second fact from a card

  // Mix the order, then deal facts card by card: always from the card with the most left that isn't the last one used,
  // so two facts from one card are never neighbours unless nothing else is left.
  const groups = new Map<string, string[]>();
  for (const id of shuffle(picked, rand)) { const c = byId.get(id)!.card; groups.set(c, [...(groups.get(c) ?? []), id]); }
  const out: string[] = [];
  let last = '';
  while (out.length < picked.length) {
    let best = '';
    for (const [c, ids] of groups) if (ids.length && c !== last && (!best || ids.length > groups.get(best)!.length)) best = c;
    if (!best) best = last; // only the last card has facts left
    out.push(groups.get(best)!.shift()!); last = best;
  }
  return out.map((id) => ({ id, ahead: !dueSet.has(id) && !!srs[id] }));
}

/** Practised but not yet due, as stored right now. */
export function isAheadNow(db: DbState, id: string, today = ymd()): boolean {
  const e = db.flash.srs[id];
  return !!e && !dueIds({ [id]: e }, today, db.settings.examDate).length;
}

/** What a round needs to know it's still writing to the same data (a reset or restore anywhere ends it). */
export const roundStamp = () => ({ createdAt: ctx.store.state.meta.createdAt, epoch: ctx.store.replaceEpoch });
export type RoundStamp = ReturnType<typeof roundStamp>;
const sameData = (s: RoundStamp) => ctx.store.replacing === 0 && s.createdAt === ctx.store.state.meta.createdAt && s.epoch === ctx.store.replaceEpoch;

/**
 * Saves the first-try grade of a fact in this round. `prev` is the entry from before this round's answer
 * (so "That was a guess" re-grades from it). Practice ahead never raises a level: a right answer there saves nothing.
 * Returns false when nothing was saved because the data was replaced since the round began.
 */
export function gradeFlash(id: string, grade: Grade, prev: SrsEntry | undefined, ahead: boolean, stamp: RoundStamp, now = Date.now()): boolean {
  if (!sameData(stamp)) return false;
  const st = ctx.store.state; // the current state, never the round's starting copy
  const today = ymd(now);
  const days = st.flash.days.includes(today) ? st.flash.days : [...st.flash.days, today].slice(-400);
  if (ahead && grade !== 'wrong') { if (days !== st.flash.days) ctx.store.set('flash', { ...st.flash, days }); return true; }
  ctx.store.set('flash', { srs: { ...st.flash.srs, [id]: scheduleCard(prev, grade, today, st.settings.examDate, now) }, days });
  return true;
}

/** Display order for a fact's options, reshuffled each time it's shown. */
export function optionOrder(f: Flash, rand = Math.random): number[] {
  return f.type === 'tf' ? [] : shuffle((f.options ?? []).map((_, i) => i), rand);
}
export const isRight = (f: Flash, choice: number | boolean) => choice === f.answer;
