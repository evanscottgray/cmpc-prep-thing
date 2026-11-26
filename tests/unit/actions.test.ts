import { beforeEach, describe, expect, it } from 'vitest';
import { ctx } from '../../src/ctx';
import { memoryKv } from '../../src/lib/db';
import { Store, emptyState } from '../../src/lib/store';
import { abandon, autoSubmitExpired, choose, finishReview, createSession, leftReviewItem, markOpened, markReviewed, missedPositions, nextMiss, reviewStep, pause, resume, startSession, submit, toggleFlag, toggleStrike, goTo } from '../../src/lib/actions';
import { buildForm, buildMixed } from '../../src/lib/assemble';
import { dueIds } from '../../src/lib/srs';
import { availableItems, itemStats, pacingStats, todayCount } from '../../src/lib/stats';
import { loadBank } from './helpers';

const bank = loadBank();
beforeEach(() => {
  ctx.bank = bank; ctx.items = new Map(bank.items.map((i) => [i.id, i]));
  ctx.store = new Store(memoryKv(), emptyState(1), null);
});
const start = (mode: 'strict' | 'coached' = 'strict', t = 1000) => {
  const s = buildForm(bank, ctx.store.state, 'A', mode, t, 5);
  createSession(s); startSession(s.id, t); return s.id;
};
const S = (id: string) => ctx.store.state.sessions[id];
const key = (id: string, pos: number) => ctx.items.get(S(id).items[pos].id)!.answer;

describe('exam lifecycle', () => {
  it('counts only answered questions toward the daily goal', () => {
    const id = start(); const now = Date.now();
    for (let p = 0; p < 10; p++) choose(id, p, key(id, p));
    submit(id, false, now);
    expect(ctx.store.state.attempts).toHaveLength(115);
    expect(todayCount(ctx.store.state, now)).toBe(10);
    expect(itemStats(ctx.store.state.attempts).size).toBe(10); // blanks are not seen
    expect(S(id).result!.answered).toBe(10);
  });
  it('scores a perfect paper as 100/100 and records all 115 attempts once', () => {
    const id = start();
    for (let p = 0; p < 115; p++) choose(id, p, key(id, p));
    submit(id, false, 60000);
    expect(S(id).result!.raw).toBe(100);
    expect(S(id).result!.scaled).toBe(800);
    expect(ctx.store.state.attempts).toHaveLength(115);
    submit(id, false, 70000);
    expect(ctx.store.state.attempts).toHaveLength(115);
  });
  it('does not duplicate attempts if a crash left the session active after they were saved', () => {
    const id = start();
    choose(id, 0, key(id, 0));
    const before = S(id);
    submit(id, false, 60000);
    ctx.store.putSession(before); // as if the final write never landed
    submit(id, false, 61000);
    expect(ctx.store.state.attempts).toHaveLength(115);
    expect(S(id).status).toBe('submitted');
  });
  it('auto-submits at exactly the deadline however late the app is reopened', () => {
    const id = start('strict', 1000);
    choose(id, 0, key(id, 0));
    expect(autoSubmitExpired(1000 + 89 * 60000)).toEqual([]);
    expect(autoSubmitExpired(1000 + 500 * 60000)).toEqual([id]);
    expect(S(id).autoSubmitted).toBe(true);
    expect(S(id).submittedAt).toBe(1000 + 90 * 60000);
    expect(S(id).result!.timeUsedMs).toBe(90 * 60000);
    expect(S(id).result!.answered).toBe(1);
  });
  it('strict mode refuses to pause; coached pause stops the clock', () => {
    const a = start('strict'); pause(a, 2000); expect(S(a).pausedAt).toBeNull();
    const b = start('coached', 1000); pause(b, 2000); resume(b, 2000 + 50 * 60000);
    expect(autoSubmitExpired(1000 + 100 * 60000)).toEqual([a]);
    expect(S(b).status).toBe('active');
  });
  it('queues missed and flagged items for review, but not plain correct ones', () => {
    const id = start();
    for (let p = 0; p < 115; p++) choose(id, p, p === 1 ? (key(id, p) + 1) % 4 : key(id, p));
    toggleFlag(id, 2);
    submit(id, false, 60000);
    expect(Object.keys(ctx.store.state.srs).sort()).toEqual([S(id).items[1].id, S(id).items[2].id].sort());
  });
  it('review resumes on the miss last visited and is done only after the last miss is left', () => {
    const id = start();
    for (let p = 0; p < 115; p++) if (p > 2) choose(id, p, key(id, p)); // only 0-2 missed (scored or not)
    submit(id, false, 60000);
    const m = missedPositions(S(id));
    expect(m.slice(0, 3)).toEqual([0, 1, 2]);
    expect(nextMiss(S(id))).toBe(0);
    markOpened(id, 0); leftReviewItem(id);
    markOpened(id, 1); // left mid-read
    expect(nextMiss(S(id))).toBe(1);
    for (const p of m.slice(2)) markOpened(id, p);
    expect(S(id).reviewedAt).toBeUndefined(); // opening the last miss isn't finishing it
    leftReviewItem(id);
    expect(S(id).reviewedAt).toBeUndefined(); // nor is leaving it: only "Finish review" finishes
    finishReview(id);
    expect(S(id).reviewedAt).toBeDefined();
    expect(S(id).reviewedRead).toBeDefined(); // finished by reading, not by skipping
  });
  it('a miss read and left resumes at the next unread one; one interrupted mid-read reopens', () => {
    const id = start();
    for (let p = 0; p < 115; p++) if (p > 2) choose(id, p, key(id, p)); // 0-2 missed
    submit(id, false, 60000);
    markOpened(id, 0); leftReviewItem(id); // read and left
    expect(nextMiss(S(id))).toBe(1);
    markOpened(id, 2); // jumped ahead to 2, app closed while reading it
    expect(nextMiss(S(id))).toBe(2);
    leftReviewItem(id); // left 2: the only unread one is 1
    expect(nextMiss(S(id))).toBe(1);
    expect(S(id).reviewedAt).toBeUndefined();
  });
  it('a correct question opened last is not offered as "Resume last miss"', () => {
    const id = start();
    for (let p = 0; p < 115; p++) if (p > 2) choose(id, p, key(id, p)); // 0-2 missed
    submit(id, false, 60000);
    for (const p of missedPositions(S(id))) { markOpened(id, p); leftReviewItem(id); }
    markOpened(id, missedPositions(S(id))[0]); // rereading a miss, interrupted
    expect(reviewStep(S(id)).kind).toBe('resumeLast');
    markOpened(id, 50); // then a correct one from "Review all", interrupted
    expect(reviewStep(S(id))).toEqual({ kind: 'finish' });
  });
  it('a review set aside can still be finished by reading the rest', () => {
    const id = start();
    for (let p = 0; p < 115; p++) if (p > 2) choose(id, p, key(id, p));
    submit(id, false, 60000);
    markReviewed(id); // "Skip this review"
    const at = S(id).reviewedAt;
    expect(at).toBeDefined(); expect(S(id).reviewedRead).toBeUndefined();
    finishReview(id); // not every miss read yet: nothing happens
    expect(S(id).reviewedRead).toBeUndefined();
    for (const p of missedPositions(S(id))) markOpened(id, p);
    finishReview(id);
    expect(S(id).reviewedRead).toBeDefined();
    expect(S(id).reviewedAt).toBe(at); // still dated from when it was set aside
  });
  it('striking the chosen option clears it; choosing a struck option restores it', () => {
    const id = start();
    choose(id, 0, 2); toggleStrike(id, 0, 2);
    expect(S(id).responses[0]).toBeUndefined();
    choose(id, 0, 2);
    expect(S(id).strikes[0]).toEqual([]);
  });
});

describe('discarded exams', () => {
  it('remember which items were opened, so the next sitting is not called fresh, and keep the form locked', () => {
    const id = start();
    choose(id, 0, 1); goTo(id, 1, 5000);
    const opened = [S(id).items[0].id, S(id).items[1].id];
    abandon(id);
    expect(ctx.store.state.meta.exposed!.sort()).toEqual(opened.sort());
    const again = buildForm(bank, ctx.store.state, 'A', 'strict', 9, 9);
    expect(again.retake).toBe(true);
    expect(again.seenBefore).toBe(2);
    expect(availableItems(bank, ctx.store.state).some((i) => i.pool === 'A')).toBe(false);
    expect(buildForm(bank, ctx.store.state, 'B', 'strict', 9, 9).retake).toBe(false);
    expect(buildMixed(bank, ctx.store.state, 'strict', 9, 9).seenBefore).toBe(0);
  });
});

describe('moved exam date', () => {
  it('pulls reviews that would fall on or after exam day back to the day before', () => {
    const srs = { x: { box: 4, due: '2026-03-20', last: 0 } };
    expect(dueIds(srs, '2026-03-09', '2026-03-10')).toEqual(['x']);
    expect(dueIds(srs, '2026-03-08', '2026-03-10')).toEqual([]);
    expect(dueIds(srs, '2026-03-08', null)).toEqual([]);
  });
});

describe('every blueprint cell', () => {
  it('a mixed exam matches the grid across 25 seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = buildMixed(bank, emptyState(1), 'strict', 1, seed);
      const n: Record<string, number> = {};
      for (const x of s.items.filter((y) => y.scored)) { const i = ctx.items.get(x.id)!; n[`${i.kg}|${i.domain}`] = (n[`${i.kg}|${i.domain}`] || 0) + 1; }
      for (const k of bank.blueprint.kgs) for (const d of bank.blueprint.domains) expect(n[`${k.id}|${d.id}`] ?? 0).toBe(bank.blueprint.grid[k.id][d.id]);
    }
  });
});

describe('exam time', () => {
  it('untimed exams store no answer times (so pace stats, old tabs included, leave them out); double time keeps them', () => {
    for (const time of ['untimed', 'double'] as const) {
      const s = buildForm(ctx.bank, ctx.store.state, time === 'untimed' ? 'A' : 'B', 'strict', 1000, 3, time);
      createSession(s); startSession(s.id, 1000);
      choose(s.id, 0, 0);
      submit(s.id, false, 1000 + 120_000);
    }
    const ms = (t: string) => ctx.store.state.attempts.filter((a) => ctx.store.state.sessions[a.s!].time === t && a.ms).length;
    expect(ms('untimed')).toBe(0);
    expect(ms('double')).toBe(1);
    expect(pacingStats(ctx.store.state)!.n).toBe(1);
    // an untimed exam submitted by an older tab still carries answer times: left out all the same
    const u = Object.values(ctx.store.state.sessions).find((x) => x.time === 'untimed')!;
    expect(pacingStats({ ...ctx.store.state, attempts: [...ctx.store.state.attempts, { i: 'x', t: 1, ok: true, src: 'exam', ms: 9_000_000, s: u.id }] })!.n).toBe(1);
  });
  it('an untimed exam is never auto-submitted, and submits normally', () => {
    const s = buildForm(ctx.bank, ctx.store.state, 'A', 'strict', Date.now(), 3, 'untimed');
    createSession(s); startSession(s.id);
    expect(autoSubmitExpired(Date.now() + 10 * 86400000)).toEqual([]);
    submit(s.id);
    const done = ctx.store.state.sessions[s.id];
    expect(done.status).toBe('submitted');
    expect(done.autoSubmitted).toBe(false);
    expect(done.result!.durationMs).toBe(0);
  });
});
