import { describe, it, expect } from 'vitest';
import { scaledScore, scoreSession, elapsedMs, remainingMs, isExpired, pacing } from '../../src/lib/scoring';
import type { Session, Item } from '../../src/types';

describe('scaledScore', () => {
  it('maps 0→200, target→550, 100→800 linearly on each side', () => {
    expect(scaledScore(0, 70)).toBe(200);
    expect(scaledScore(70, 70)).toBe(550);
    expect(scaledScore(100, 70)).toBe(800);
    expect(scaledScore(35, 70)).toBe(375);
    expect(scaledScore(85, 70)).toBe(675);
  });
  it('honours a configurable target', () => {
    expect(scaledScore(60, 60)).toBe(550);
    expect(scaledScore(30, 60)).toBe(375);
    expect(scaledScore(80, 60)).toBe(675);
  });
  it('clamps out-of-range raw scores', () => {
    expect(scaledScore(-5, 70)).toBe(200);
    expect(scaledScore(120, 70)).toBe(800);
  });
});

const mkItem = (id: string, domain: any, kg: any, answer = 0): Item => ({ id, pool: 'A', scored: true, domain, kg, topic: 't', cog: 'application', diff: 2, fmt: 'vignette', ctx: { setting: 'general', level: 'na', delivery: 'na' }, stem: 's?', options: ['a', 'b', 'c', 'd'], answer, rationales: ['', '', '', ''], takeaway: '', refs: [] });
const mkSession = (n: number, scoredUpTo: number): Session => ({
  id: 's', kind: 'formA', title: 'Form A', createdAt: 0, timed: true, mode: 'strict', durationMs: 90 * 60000,
  startedAt: 1_000_000, pausedAt: null, pausedMs: 0,
  items: Array.from({ length: n }, (_, i) => ({ id: `q${i}`, scored: i < scoredUpTo, order: [0, 1, 2, 3] })),
  responses: {}, flags: [], strikes: {}, unsure: [], revealed: [], timeOnItem: {}, current: 0, visitAt: null,
  status: 'active', submittedAt: null, autoSubmitted: false, retake: false, seenBefore: 0, result: null,
});

describe('scoreSession', () => {
  it('scores only scored items; unanswered count as wrong; reports domains, KGs and flagged accuracy', () => {
    const items = new Map<string, Item>();
    for (let i = 0; i < 115; i++) items.set(`q${i}`, mkItem(`q${i}`, i % 2 ? 'I' : 'IV', i % 3 ? 'G' : 'I'));
    const s = mkSession(115, 100);
    for (let i = 0; i < 80; i++) s.responses[i] = 0;      // 80 correct scored
    for (let i = 80; i < 90; i++) s.responses[i] = 1;     // 10 wrong scored; 10 scored unanswered
    for (let i = 100; i < 115; i++) s.responses[i] = 0;   // unscored all correct — must not count
    s.flags = [0, 85];
    const r = scoreSession(s, items, 70, 1_000_000 + 60 * 60000);
    expect(r.raw).toBe(80);
    expect(r.scoredCount).toBe(100);
    expect(r.scaled).toBe(scaledScoreCheck(80));
    expect(r.pass).toBe(true);
    expect(r.answered).toBe(105);
    expect(r.flagged).toEqual({ c: 1, n: 2 });
    expect(Object.values(r.byDomain).reduce((a, b) => a + b.n, 0)).toBe(100);
    expect(r.timeUsedMs).toBe(60 * 60000);
  });
});
function scaledScoreCheck(raw: number) { return Math.round(550 + ((raw - 70) / 30) * 250); }

describe('wall-clock timer', () => {
  it('keeps running regardless of the app being open', () => {
    const s = mkSession(115, 100);
    expect(remainingMs(s, 1_000_000 + 30 * 60000)).toBe(60 * 60000);
    expect(isExpired(s, 1_000_000 + 89 * 60000)).toBe(false);
    expect(isExpired(s, 1_000_000 + 91 * 60000)).toBe(true);
  });
  it('excludes paused time (coached mode)', () => {
    const s = { ...mkSession(115, 100), mode: 'coached' as const, pausedMs: 10 * 60000 };
    expect(elapsedMs(s, 1_000_000 + 40 * 60000)).toBe(30 * 60000);
    const paused = { ...s, pausedAt: 1_000_000 + 40 * 60000 };
    expect(elapsedMs(paused, 1_000_000 + 70 * 60000)).toBe(30 * 60000);
    expect(isExpired(paused, 1_000_000 + 200 * 60000)).toBe(false);
  });
  it('computes pacing against 47 s per item', () => {
    const s = mkSession(115, 100);
    for (let i = 0; i < 10; i++) s.responses[i] = 0;
    const p = pacing(s, 1_000_000 + 470_000, 47);
    expect(p.expected).toBe(10);
    expect(p.deltaSec).toBe(0);
  });
});
