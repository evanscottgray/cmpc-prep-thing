import type { DbState, Session } from '../types';
import { daysBetween, ymd } from './dates';
import { dueIds } from './srs';
import { examHistory, formTaken, todayCount } from './stats';

export type Action =
  | { kind: 'resume'; session: Session }
  | { kind: 'formA' } | { kind: 'formB' } | { kind: 'mixed' }
  | { kind: 'reviewExam'; session: Session }
  | { kind: 'weak'; count: number }
  | { kind: 'review'; count: number }
  | { kind: 'light' }
  | { kind: 'done' }
  | { kind: 'passed' };

export interface Plan {
  phase: 'no-date' | 'diagnostic' | 'build' | 'final-week' | 'taper' | 'exam-day' | 'after';
  daysLeft: number | null;
  primary: Action;
  why: string;
  dueItems: number;
  dueCards: number;
  answeredToday: number;
}

/**
 * Cadence: Form A early as a diagnostic → weak-area drills → Form B in the build phase →
 * mixed exam in the final week → light review only in the last two days.
 */
export function plan(db: DbState, now = Date.now()): Plan {
  const today = ymd(now);
  const dueItems = dueIds(db.srs, today, db.settings.examDate).filter((id) => !db.hidden.includes(id)).length;
  const dueCards = dueIds(db.cardSrs, today, db.settings.examDate).length;
  const answeredToday = todayCount(db, now);
  const base = { dueItems, dueCards, answeredToday };
  const active = Object.values(db.sessions).filter((s) => s.status === 'active' && s.startedAt && s.timed).sort((a, b) => b.createdAt - a.createdAt)[0];
  const examDate = db.settings.examDate;
  const daysLeft = examDate ? daysBetween(today, examDate) : null;
  if (active) return { ...base, phase: phaseOf(daysLeft), daysLeft, primary: { kind: 'resume', session: active }, why: active.pausedAt ? 'The timer is paused.' : 'The timer has kept going while you were away.' };
  const left = daysLeft ?? Infinity; // no date yet: study as if the exam is far off
  if (left < 0) return { ...base, phase: 'after', daysLeft, primary: { kind: 'passed' }, why: 'Your exam date has passed. Update it in Settings if you have a new date.' };
  if (left === 0) return { ...base, phase: 'exam-day', daysLeft, primary: { kind: 'light' }, why: 'Exam day. Skim a few concept cards at most, eat, and arrive early with matching ID.' };
  if (left <= 2) return { ...base, phase: 'taper', daysLeft, primary: { kind: 'light' }, why: 'Final days: light review only — concept cards and a short quiz. No full exams.' };

  const history = examHistory(db);
  const last = history[history.length - 1];
  const lastDay = last?.submittedAt ? daysBetween(ymd(last.submittedAt), today) : Infinity;
  const tookA = formTaken(db, 'formA'), tookB = formTaken(db, 'formB');
  const mixedThisWeek = history.some((s) => s.kind === 'mixed' && s.submittedAt && daysBetween(ymd(s.submittedAt), examDate!) <= 7);
  const remaining = Math.max(10, db.settings.dailyTarget - answeredToday);
  const drill = (why: string): Plan => dueItems >= 10 && answeredToday < db.settings.dailyTarget
    ? { ...base, phase: phaseOf(daysLeft), daysLeft, primary: { kind: 'review', count: Math.min(dueItems, 25) }, why: `${dueItems} items you missed or weren't sure of are due. Clear some before drilling new ones.` }
    : answeredToday >= db.settings.dailyTarget
    ? { ...base, phase: phaseOf(daysLeft), daysLeft, primary: { kind: 'done' }, why: `Daily target reached (${answeredToday} items). Extra reviews are optional.` }
    : { ...base, phase: phaseOf(daysLeft), daysLeft, primary: { kind: 'weak', count: Math.min(remaining, 30) }, why };

  if (!tookA) return { ...base, phase: daysLeft === null ? 'no-date' : 'diagnostic', daysLeft, primary: { kind: 'formA' }, why: 'Start with Form A as a diagnostic: a full timed exam shows where to focus.' };
  // After any full exam, review it the same/next day before the next big step.
  if (last && lastDay <= 1 && !reviewed(db, last)) return { ...base, phase: phaseOf(daysLeft), daysLeft, primary: { kind: 'reviewExam', session: last }, why: `Reading the rationales for what you missed is the most useful thing to do after an exam, while it's fresh.` };
  if (lastDay <= 1) return drill('Drill your weakest areas, weighted by the blueprint.');
  if (left <= 7) {
    if (!tookB && left >= 4) return { ...base, phase: 'final-week', daysLeft, primary: { kind: 'formB' }, why: 'Take Form B now — a fresh, full-length estimate before exam day.' };
    if (!mixedThisWeek && lastDay >= 2) return { ...base, phase: 'final-week', daysLeft, primary: { kind: 'mixed' }, why: 'Final week: a mixed exam assembled to the blueprint from your weak areas and unseen items.' };
    return drill('Final week: short weak-area drills and your due reviews.');
  }
  const sinceA = daysSince(db, 'formA', today);
  if (!tookB && (left <= 14 || sinceA >= 10) && sinceA >= 3) return { ...base, phase: 'build', daysLeft, primary: { kind: 'formB' }, why: 'Time for Form B: measure progress since your diagnostic.' };
  return drill('Drill your weakest areas, weighted by the blueprint.');
}

function phaseOf(d: number | null): Plan['phase'] {
  if (d === null) return 'no-date';
  if (d < 0) return 'after';
  if (d === 0) return 'exam-day';
  if (d <= 2) return 'taper';
  if (d <= 7) return 'final-week';
  return 'build';
}
function daysSince(db: DbState, kind: string, today: string): number {
  const s = Object.values(db.sessions).filter((x) => x.kind === kind && x.submittedAt).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];
  return s?.submittedAt ? daysBetween(ymd(s.submittedAt), today) : Infinity;
}
/** An exam counts as reviewed once every miss was opened, or the learner marked the review done. */
function reviewed(db: DbState, s: Session): boolean {
  return !!db.sessions[s.id]?.reviewedAt;
}
