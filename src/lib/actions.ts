// Mutations on sessions and progress. Every change is persisted immediately by the store.
import type { Attempt, AttemptSource, Session } from '../types';
import { ctx, APP_VERSION } from '../ctx';
import { ymd } from './dates';
import { schedule, type Grade } from './srs';
import { inPlay, isExpired, scoreSession } from './scoring';
import { uid } from './rng';

const SRC: Record<Session['kind'], AttemptSource> = { formA: 'exam', formB: 'exam', mixed: 'exam', block: 'block', timed: 'timed', drill: 'drill', quiz: 'quiz', review: 'review' };

const get = (id: string) => ctx.store.state.sessions[id];
const put = (s: Session) => ctx.store.putSession(s);

export function createSession(s: Session) { put(s); }

export function startSession(id: string, now = Date.now()) {
  const s = get(id); if (!s || s.startedAt) return;
  put({ ...s, startedAt: now, visitAt: now });
}

/** Accumulate time on the current item and move to `pos`. */
export function goTo(id: string, pos: number, now = Date.now()) {
  const s = get(id); if (!s || s.status !== 'active') return;
  const p = Math.max(0, Math.min(s.items.length - 1, pos));
  const timeOnItem = { ...s.timeOnItem };
  if (s.visitAt && !s.pausedAt) timeOnItem[s.current] = (timeOnItem[s.current] || 0) + Math.max(0, now - s.visitAt);
  put({ ...s, current: p, visitAt: s.pausedAt ? null : now, timeOnItem, scrollY: 0 });
}

export function choose(id: string, pos: number, orig: number) {
  const s = get(id); if (!s || s.status !== 'active') return;
  if (s.revealed.includes(pos)) return; // tutor: locked once checked
  const strikes = { ...s.strikes };
  if (strikes[pos]?.includes(orig)) strikes[pos] = strikes[pos].filter((x) => x !== orig);
  put({ ...s, responses: { ...s.responses, [pos]: orig }, strikes });
}
export function clearChoice(id: string, pos: number) {
  const s = get(id); if (!s || s.status !== 'active') return;
  const { [pos]: _, ...rest } = s.responses;
  put({ ...s, responses: rest });
}
export function toggleFlag(id: string, pos: number) {
  const s = get(id); if (!s || s.status !== 'active') return;
  const flags = s.flags.includes(pos) ? s.flags.filter((x) => x !== pos) : [...s.flags, pos].sort((a, b) => a - b);
  put({ ...s, flags });
}
export function toggleStrike(id: string, pos: number, orig: number) {
  const s = get(id); if (!s || s.status !== 'active') return;
  const cur = s.strikes[pos] ?? [];
  const next = cur.includes(orig) ? cur.filter((x) => x !== orig) : [...cur, orig];
  const responses = { ...s.responses };
  if (next.includes(orig) && responses[pos] === orig) delete responses[pos];
  put({ ...s, strikes: { ...s.strikes, [pos]: next }, responses });
}
export function setUnsure(id: string, pos: number, on: boolean) {
  const s = get(id); if (!s) return;
  const unsure = on ? [...new Set([...s.unsure, pos])] : s.unsure.filter((x) => x !== pos);
  put({ ...s, unsure });
}
export function saveScroll(id: string, y: number) {
  const s = get(id); if (!s || s.status !== 'active' || s.scrollY === y) return;
  put({ ...s, scrollY: y });
}

export function pause(id: string, now = Date.now()) {
  const s = get(id); if (!s || s.mode !== 'coached' || s.pausedAt || s.status !== 'active') return;
  const timeOnItem = { ...s.timeOnItem };
  if (s.visitAt) timeOnItem[s.current] = (timeOnItem[s.current] || 0) + Math.max(0, now - s.visitAt);
  put({ ...s, pausedAt: now, visitAt: null, timeOnItem });
}
export function resume(id: string, now = Date.now()) {
  const s = get(id); if (!s || !s.pausedAt) return;
  put({ ...s, pausedMs: s.pausedMs + (now - s.pausedAt), pausedAt: null, visitAt: now });
}

function addAttempts(list: Attempt[]) {
  if (!list.length) return;
  ctx.store.set('attempts', [...ctx.store.state.attempts, ...list]);
}
function updateSrs(entries: { id: string; grade: Grade }[]) {
  const st = ctx.store.state;
  const today = ymd();
  const srs = { ...st.srs };
  for (const { id, grade } of entries) {
    const next = schedule(srs[id], grade, today, st.settings.examDate);
    if (next) srs[id] = next; else delete srs[id];
  }
  ctx.store.set('srs', srs);
}

/** Tutor: lock in the answer, record the attempt, schedule review. */
export function check(id: string, pos: number, now = Date.now()) {
  const s = get(id); if (!s || s.revealed.includes(pos)) return;
  const si = s.items[pos];
  const item = ctx.items.get(si.id); if (!item) return;
  const resp = s.responses[pos]; if (resp === undefined) return;
  const ok = resp === item.answer;
  const unsure = s.unsure.includes(pos);
  const timeOnItem = { ...s.timeOnItem };
  if (s.visitAt) timeOnItem[pos] = (timeOnItem[pos] || 0) + Math.max(0, now - s.visitAt);
  put({ ...s, revealed: [...s.revealed, pos], timeOnItem, visitAt: now });
  addAttempts([{ i: si.id, t: now, ok, src: SRC[s.kind], ms: timeOnItem[pos], unsure: unsure || undefined, s: s.id }]);
  updateSrs([{ id: si.id, grade: !ok ? 'wrong' : unsure ? 'unsure' : 'right' }]);
}

export function finishTutor(id: string, now = Date.now()) {
  const s = get(id); if (!s || s.status !== 'active') return;
  const result = scoreSession(s, ctx.items, ctx.store.state.settings.rawTarget, now);
  put({ ...s, status: 'submitted', submittedAt: now, result });
}

/** Timed: score, record every item (unanswered = wrong), schedule missed/flagged items for review. */
export function submit(id: string, auto = false, now = Date.now()) {
  const s = get(id); if (!s || s.status !== 'active') return;
  const end = auto && s.startedAt ? Math.min(now, s.startedAt + s.pausedMs + s.durationMs) : now;
  const timeOnItem = { ...s.timeOnItem };
  if (s.visitAt && !s.pausedAt) timeOnItem[s.current] = (timeOnItem[s.current] || 0) + Math.max(0, end - s.visitAt);
  const pausedMs = s.pausedAt ? s.pausedMs + (end - s.pausedAt) : s.pausedMs;
  const done: Session = { ...s, timeOnItem, pausedAt: null, pausedMs, visitAt: null, status: 'submitted', submittedAt: end, autoSubmitted: auto };
  done.result = scoreSession(done, ctx.items, ctx.store.state.settings.rawTarget, end);
  const flags = new Set(s.flags);
  const attempts: Attempt[] = [];
  const grades: { id: string; grade: Grade }[] = [];
  s.items.forEach((si, pos) => {
    const item = ctx.items.get(si.id); if (!item) return;
    const resp = s.responses[pos];
    const ok = resp !== undefined && resp === item.answer;
    attempts.push({ i: si.id, t: end, ok, src: SRC[s.kind], ms: timeOnItem[pos] || 0, unsure: flags.has(pos) || undefined, s: s.id, na: resp === undefined || undefined });
    if (!ok) grades.push({ id: si.id, grade: 'wrong' });
    else if (flags.has(pos)) grades.push({ id: si.id, grade: 'unsure' });
    else if (ctx.store.state.srs[si.id]) grades.push({ id: si.id, grade: 'right' });
  });
  // Progress is written before the session is marked submitted. If the app dies in between, the next load
  // submits again; attempts already recorded for this session are not duplicated.
  if (!ctx.store.state.attempts.some((a) => a.s === s.id)) { addAttempts(attempts); updateSrs(grades); }
  put(done);
}

/** Called on load and on every tick: submits sessions whose time ran out while the app was closed. */
export function autoSubmitExpired(now = Date.now()): string[] {
  const out: string[] = [];
  for (const s of Object.values(ctx.store.state.sessions)) if (isExpired(s, now)) { submit(s.id, true, now); out.push(s.id); }
  return out;
}

export const missedPositions = (s: Session) => s.items.map((_, i) => i).filter((i) => inPlay(s, i) && s.responses[i] !== ctx.items.get(s.items[i].id)?.answer);
/** Where a review resumes: the miss last visited, else the first one not yet opened. */
export const nextMiss = (s: Session) => {
  const m = missedPositions(s);
  if (s.reviewPos !== undefined && m.includes(s.reviewPos)) return s.reviewPos;
  const o = new Set(s.opened); return m.find((i) => !o.has(i));
};
export const openedMisses = (s: Session) => { const o = new Set(s.opened); return missedPositions(s).filter((i) => o.has(i)).length; };

export function markReviewed(id: string) {
  const s = get(id); if (!s || s.reviewedAt) return;
  put({ ...s, reviewedAt: Date.now() });
}
/** Records that an item was opened in review, and where to resume. */
export function markOpened(id: string, pos: number) {
  const s = get(id); if (!s || (s.opened?.includes(pos) && s.reviewPos === pos)) return;
  put({ ...s, opened: s.opened?.includes(pos) ? s.opened : [...(s.opened ?? []), pos], reviewPos: pos });
}
/** Called when the learner moves on from an item: the review is done once every miss has been opened and left. */
export function leftReviewItem(id: string) {
  const s = get(id); if (!s) return;
  if (openedMisses(s) === missedPositions(s).length) markReviewed(id);
}

/** Discard an unfinished session. Items already opened are remembered so a later sitting isn't called fresh. */
export function abandon(id: string) {
  const s = get(id);
  if (s?.startedAt) {
    const st = ctx.store.state;
    const opened = s.items.filter((_, p) => p === s.current || s.responses[p] !== undefined || s.timeOnItem[p] !== undefined).map((x) => x.id);
    ctx.store.set('meta', { ...st.meta, exposed: [...new Set([...(st.meta.exposed ?? []), ...opened])] });
  }
  ctx.store.deleteSession(id);
}

export function hideItem(itemId: string, hide: boolean) {
  const h = new Set(ctx.store.state.hidden);
  if (hide) h.add(itemId); else h.delete(itemId);
  ctx.store.set('hidden', [...h]);
  if (hide && ctx.store.state.srs[itemId]) { const { [itemId]: _, ...rest } = ctx.store.state.srs; ctx.store.set('srs', rest); }
}

export function addReport(itemId: string, kind: string, note: string) {
  ctx.store.set('reports', [...ctx.store.state.reports, { id: uid('r-'), itemId, kind, note, at: Date.now(), appVersion: APP_VERSION, contentVersion: ctx.bank.version }]);
}
