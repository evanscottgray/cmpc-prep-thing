import type { DbState } from '../types';
import { ymd } from './dates';

/** Noon on the calendar day `back` days before `now` (noon keeps daylight-saving shifts from skipping a day). */
const dayAt = (now: number, back: number) => { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - back); return d.getTime(); };

/** Local dates (YYYY-MM-DD) with study: answered questions, rated concept cards, opened exam reviews, flash rounds. */
export function studyDays(db: DbState): Set<string> {
  const days = new Set<string>();
  for (const a of db.attempts) if (!a.na) days.add(ymd(a.t));
  for (const c of Object.values(db.cardSrs)) if (c.last) days.add(ymd(c.last)); // before days were recorded
  for (const d of db.meta.days ?? []) days.add(d);
  for (const d of db.flash?.days ?? []) days.add(d); // flash keeps its own study days (it never writes meta)
  return days;
}

/**
 * Days in a row with some study, ending today, or ending yesterday when today hasn't started yet
 * (a streak isn't lost until a whole day passes without study).
 */
export function streak(days: Set<string>, now = Date.now()): { count: number; today: boolean } {
  const today = days.has(ymd(now));
  let count = 0;
  for (let back = today ? 0 : 1; days.has(ymd(dayAt(now, back))); back++) count++;
  return { count, today };
}

/** The last seven days, oldest first, for the week strip on Today. */
export function lastWeek(days: Set<string>, now = Date.now()): { date: string; label: string; studied: boolean; today: boolean }[] {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const t = dayAt(now, i);
    const date = ymd(t);
    out.push({ date, label: new Date(t).toLocaleDateString(undefined, { weekday: 'narrow' }), studied: days.has(date), today: i === 0 });
  }
  return out;
}

/** Consecutive correct answers at the end of a tutor session, in the order they were checked. */
export function runOfCorrect(revealed: number[], correctAt: (pos: number) => boolean): number {
  let n = 0;
  for (let i = revealed.length - 1; i >= 0 && correctAt(revealed[i]); i--) n++;
  return n;
}

/** The longest run of correct answers in a session so far, kept after a miss so a good run isn't simply taken away. */
export function bestRun(revealed: number[], correctAt: (pos: number) => boolean): number {
  let best = 0, n = 0;
  for (const p of revealed) { n = correctAt(p) ? n + 1 : 0; best = Math.max(best, n); }
  return best;
}
