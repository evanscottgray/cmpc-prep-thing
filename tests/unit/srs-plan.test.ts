import { describe, it, expect } from 'vitest';
import { schedule, scheduleCard, intervalFor, dueIds } from '../../src/lib/srs';
import { plan } from '../../src/lib/plan';
import { emptyState } from '../../src/lib/store';
import { addDays, ymd } from '../../src/lib/dates';
import type { DbState, Session } from '../../src/types';

describe('spaced review', () => {
  const today = '2026-03-01';
  it('only missed or uncertain items enter review', () => {
    expect(schedule(undefined, 'right', today, null)).toBeNull();
    expect(schedule(undefined, 'wrong', today, null)?.due).toBe('2026-03-02');
    expect(schedule(undefined, 'unsure', today, null)?.box).toBe(0);
  });
  it('compresses intervals to fit the time left', () => {
    expect(intervalFor(4, today, null)).toBe(16);
    expect(intervalFor(4, today, addDays(today, 10))).toBeLessThanOrEqual(9);
    expect(intervalFor(2, today, addDays(today, 2))).toBe(1);
  });
  it('never schedules past the day before the exam', () => {
    const exam = addDays(today, 5);
    let e = schedule(undefined, 'wrong', today, exam)!;
    for (let k = 0; k < 3; k++) { const n = schedule(e, 'right', today, exam); if (!n) break; expect(n.due < exam).toBe(true); e = n; }
  });
  it('graduates after enough correct reviews; wrong resets', () => {
    let e = schedule(undefined, 'wrong', today, null)!;
    e = schedule(e, 'right', today, null)!; expect(e.box).toBe(1);
    e = schedule(e, 'wrong', today, null)!; expect(e.box).toBe(0);
    let n: typeof e | null = e; let steps = 0;
    while (n) { n = schedule(n, 'right', today, null); steps++; }
    expect(steps).toBe(5);
  });
  it('cards stay in rotation and dueIds orders by date', () => {
    const c = scheduleCard(undefined, 'right', today, null);
    expect(c.box).toBe(1);
    expect(dueIds({ a: { box: 0, due: '2026-02-28', last: 0 }, b: { box: 0, due: '2026-03-05', last: 0 }, c: { box: 1, due: '2026-02-27', last: 0 } }, today)).toEqual(['c', 'a']);
  });
});

const exam = (kind: Session['kind'], submittedAt: number, extra: Partial<Session> = {}): Session => ({
  id: `${kind}-${submittedAt}`, kind, title: kind, createdAt: submittedAt, timed: true, mode: 'strict', durationMs: 1, startedAt: submittedAt, pausedAt: null, pausedMs: 0,
  items: [], responses: {}, flags: [], strikes: {}, unsure: [], revealed: [], timeOnItem: {}, current: 0, visitAt: null, status: 'submitted', submittedAt, autoSubmitted: false,
  retake: false, seenBefore: 0, result: { raw: 60, scoredCount: 100, scaled: 500, pass: false, rawTarget: 70, byDomain: {}, byKg: {}, flagged: { c: 0, n: 0 }, answered: 0, total: 115, correctAll: 0, timeUsedMs: 0, durationMs: 0 }, reviewedAt: submittedAt, ...extra,
});
const DAY = 86400000;
const NOW = new Date(2026, 2, 1, 12).getTime();
const withDate = (days: number): DbState => { const db = emptyState(); db.settings.examDate = addDays(ymd(NOW), days); return db; };

describe('Today cadence', () => {
  it('recommends studying even without a date', () => { const p = plan(emptyState(), NOW); expect(p.primary.kind).toBe('formA'); expect(p.phase).toBe('no-date'); });
  it('starts with Form A as a diagnostic', () => expect(plan(withDate(21), NOW).primary.kind).toBe('formA'));
  it('resumes a running exam above everything else', () => {
    const db = withDate(21);
    db.sessions.x = { ...exam('formA', NOW), status: 'active', submittedAt: null, result: null };
    expect(plan(db, NOW).primary.kind).toBe('resume');
  });
  it('recommends reviewing an exam right after it if not reviewed', () => {
    const db = withDate(21);
    const s = exam('formA', NOW - 3600000, { reviewedAt: undefined });
    db.sessions[s.id] = s;
    expect(plan(db, NOW).primary.kind).toBe('reviewExam');
  });
  it('drills weak areas between forms, then Form B later', () => {
    const db = withDate(20);
    const a = exam('formA', NOW - 4 * DAY); db.sessions[a.id] = a;
    expect(plan(db, NOW).primary.kind).toBe('weak');
    const db2 = withDate(13); db2.sessions[a.id] = a;
    expect(plan(db2, NOW).primary.kind).toBe('formB');
  });
  it('clears a large review queue before drilling new items', () => {
    const db = withDate(20);
    const a = exam('formA', NOW - 4 * DAY); db.sessions[a.id] = a;
    for (let i = 0; i < 40; i++) db.srs[`x${i}`] = { box: 0, due: ymd(NOW), last: NOW - DAY };
    expect(plan(db, NOW).primary).toEqual({ kind: 'review', count: 25 });
  });
  it('copes with a mixed exam taken without an exam date', () => {
    const db = emptyState();
    const a = exam('formA', NOW - 9 * DAY), m = exam('mixed', NOW - 4 * DAY); db.sessions[a.id] = a; db.sessions[m.id] = m;
    expect(() => plan(db, NOW)).not.toThrow();
  });
  it('mixed exam in the final week', () => {
    const db = withDate(6);
    const a = exam('formA', NOW - 14 * DAY), b = exam('formB', NOW - 5 * DAY);
    db.sessions[a.id] = a; db.sessions[b.id] = b;
    expect(plan(db, NOW).primary.kind).toBe('mixed');
  });
  it('light review only in the last two days, even if Form B was never taken', () => {
    const db = withDate(2);
    const a = exam('formA', NOW - 14 * DAY); db.sessions[a.id] = a;
    expect(plan(db, NOW).primary.kind).toBe('light');
    expect(plan(withDate(1), NOW).primary.kind).toBe('light');
    expect(plan(withDate(0), NOW).phase).toBe('exam-day');
  });
  it('reports a passed exam date', () => expect(plan(withDate(-1), NOW).primary.kind).toBe('passed'));
});
