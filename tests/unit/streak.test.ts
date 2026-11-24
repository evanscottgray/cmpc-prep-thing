process.env.TZ = 'America/Chicago'; // a zone with daylight saving, so the DST case is real on any machine
import { describe, expect, it } from 'vitest';
import { emptyState } from '../../src/lib/store';
import { lastWeek, runOfCorrect, streak, studyDays } from '../../src/lib/streak';
import { ymd } from '../../src/lib/dates';

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();

describe('study streak', () => {
  it('counts days in a row ending today, and stays alive until a whole day is missed', () => {
    const days = new Set([ymd(at(2026, 11, 20)), ymd(at(2026, 11, 21)), ymd(at(2026, 11, 22))]);
    expect(streak(days, at(2026, 11, 22, 20))).toEqual({ count: 3, today: true });
    expect(streak(days, at(2026, 11, 23, 8))).toEqual({ count: 3, today: false }); // not studied yet today
    expect(streak(days, at(2026, 11, 24, 8))).toEqual({ count: 0, today: false }); // a whole day missed
  });

  it("doesn't skip or repeat a day across a daylight-saving change", () => {
    const days = new Set<string>();
    for (let d = 1; d <= 6; d++) days.add(ymd(at(2026, 11, d))); // US clocks change Nov 1, 2026
    expect(streak(days, at(2026, 11, 6, 23)).count).toBe(6);
    const week = lastWeek(days, at(2026, 11, 6, 23));
    expect(week.map((w) => w.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(week.map((w) => w.studied)).toEqual([false, true, true, true, true, true, true]);
    expect(week[6].today).toBe(true);
  });

  it('counts answered questions and rated cards, not questions left blank in a timed session', () => {
    const db = emptyState(1);
    db.attempts = [{ i: 'x', t: at(2026, 11, 20), ok: true, src: 'quiz' }, { i: 'y', t: at(2026, 11, 21), ok: false, src: 'exam', na: true }];
    db.cardSrs = { c1: { box: 1, due: '2026-11-25', last: at(2026, 11, 22) } };
    expect([...studyDays(db)].sort()).toEqual(['2026-11-20', '2026-11-22']);
  });

  it('runOfCorrect counts the correct answers at the end, in the order they were checked', () => {
    const right = new Set([0, 2, 3]);
    expect(runOfCorrect([0, 1, 2, 3], (p) => right.has(p))).toBe(2);
    expect(runOfCorrect([1, 0, 2, 3], (p) => right.has(p))).toBe(3);
    expect(runOfCorrect([], () => true)).toBe(0);
  });
});
