import type { SrsEntry } from '../types';
import { addDays, daysBetween, ymd } from './dates';

// Leitner-style boxes. Base intervals (days) are compressed to fit the time left before the exam.
export const BASE_INTERVALS = [1, 2, 4, 8, 16];
export const GRADUATE_BOX = BASE_INTERVALS.length; // reaching this box removes the entry

/** Interval for a box, compressed when the exam is close so every item gets reviewed before exam day. */
export function intervalFor(box: number, today: string, examDate: string | null): number {
  const base = BASE_INTERVALS[Math.min(box, BASE_INTERVALS.length - 1)];
  if (!examDate) return base;
  const left = daysBetween(today, examDate);
  if (left <= 1) return 1;
  const scale = Math.min(1, Math.max(0.2, left / 30));
  return Math.max(1, Math.min(Math.round(base * scale), left - 1));
}

export type Grade = 'wrong' | 'unsure' | 'right';

/** Update (or create) an entry. Returns null when the item graduates out of review. */
export function schedule(prev: SrsEntry | undefined, grade: Grade, today: string, examDate: string | null, now = Date.now()): SrsEntry | null {
  if (!prev) {
    if (grade === 'right') return null; // only missed/uncertain items enter review
    return { box: 0, due: addDays(today, 1), last: now };
  }
  let box = prev.box;
  if (grade === 'wrong') box = 0;
  else if (grade === 'unsure') box = Math.max(0, box);
  else box = box + 1;
  if (box >= GRADUATE_BOX) return null;
  let due = addDays(today, intervalFor(box, today, examDate));
  if (examDate && due >= examDate && today < addDays(examDate, -1)) due = addDays(examDate, -1);
  return { box, due, last: now };
}

/** Card scheduling: every rated card stays in rotation (cards are reference knowledge). */
export function scheduleCard(prev: SrsEntry | undefined, grade: Grade, today: string, examDate: string | null, now = Date.now()): SrsEntry {
  let box = prev ? prev.box : 0;
  if (grade === 'wrong') box = 0;
  else if (grade === 'right') box = prev ? box + 1 : 1;
  const b = Math.min(box, BASE_INTERVALS.length - 1);
  let due = addDays(today, intervalFor(b, today, examDate));
  if (examDate && due >= examDate && today < addDays(examDate, -1)) due = addDays(examDate, -1);
  return { box, due, last: now };
}

/** Due items. If the exam date has moved closer than a scheduled review, that review becomes due the day before the exam. */
export function dueIds(map: Record<string, SrsEntry>, today = ymd(), examDate: string | null = null): string[] {
  const last = examDate && examDate > today ? addDays(examDate, -1) : null;
  const due = (e: SrsEntry) => (last && e.due > last ? last : e.due);
  return Object.entries(map).filter(([, e]) => due(e) <= today).sort((a, b) => a[1].due.localeCompare(b[1].due) || a[1].box - b[1].box).map(([id]) => id);
}
