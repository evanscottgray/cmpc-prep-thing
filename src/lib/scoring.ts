import type { Bank, ExamResult, Item, Session } from '../types';

/** Linear map: 0 → 200, target → 550, 100 → 800 (piecewise on each side of the target). */
export function scaledScore(raw: number, target: number, scored = 100): number {
  const r = Math.max(0, Math.min(scored, raw)) * (100 / scored);
  const t = Math.max(1, Math.min(99, target));
  const s = r <= t ? 200 + (r / t) * 350 : 550 + ((r - t) / (100 - t)) * 250;
  return Math.round(s);
}

export function isCorrect(item: Item, response: number | undefined): boolean {
  return response !== undefined && response === item.answer;
}

export function scoreSession(s: Session, items: Map<string, Item>, rawTarget: number, now: number): ExamResult {
  const byDomain: ExamResult['byDomain'] = {};
  const byKg: ExamResult['byKg'] = {};
  let raw = 0, scoredCount = 0, answered = 0, correctAll = 0;
  const flagged = { c: 0, n: 0 };
  const flags = new Set(s.flags);
  s.items.forEach((si, pos) => {
    const it = items.get(si.id);
    if (!it) return;
    const resp = s.responses[pos];
    const ok = isCorrect(it, resp);
    if (resp !== undefined) answered++;
    if (ok) correctAll++;
    if (flags.has(pos)) { flagged.n++; if (ok) flagged.c++; }
    if (!si.scored) return;
    scoredCount++;
    if (ok) raw++;
    (byDomain[it.domain] ??= { c: 0, n: 0 }).n++;
    (byKg[it.kg] ??= { c: 0, n: 0 }).n++;
    if (ok) { byDomain[it.domain].c++; byKg[it.kg].c++; }
  });
  const timeUsedMs = Math.min(s.durationMs || Infinity, elapsedMs(s, now));
  const pct = scoredCount ? (raw / scoredCount) * 100 : 0;
  const scaled = scaledScore(pct, rawTarget, 100);
  return {
    raw, scoredCount, scaled, pass: pct >= rawTarget, rawTarget, byDomain, byKg, flagged,
    answered, total: s.items.length, correctAll, timeUsedMs: Number.isFinite(timeUsedMs) ? timeUsedMs : 0, durationMs: s.durationMs,
  };
}

/** Wall-clock elapsed time, minus pauses (coached mode only). */
export function elapsedMs(s: Session, now: number): number {
  if (!s.startedAt) return 0;
  const end = s.status === 'submitted' && s.submittedAt ? s.submittedAt : now;
  const pausedNow = s.pausedAt ? end - s.pausedAt : 0;
  return Math.max(0, end - s.startedAt - s.pausedMs - pausedNow);
}
export function remainingMs(s: Session, now: number): number {
  return Math.max(0, s.durationMs - elapsedMs(s, now));
}
export function isExpired(s: Session, now: number): boolean {
  return s.timed && s.durationMs > 0 && s.status === 'active' && s.startedAt !== null && remainingMs(s, now) <= 0;
}
/** Pacing for coached mode: how many items you "should" have reached by now at ~47 s/item. */
export function pacing(s: Session, now: number, secondsPerItem = 47) {
  const el = elapsedMs(s, now);
  const expected = Math.min(s.items.length, Math.floor(el / 1000 / secondsPerItem));
  const answered = Object.keys(s.responses).length;
  const deltaSec = answered * secondsPerItem - el / 1000; // + ahead, - behind
  return { expected, answered, deltaSec: Math.round(deltaSec) };
}
export function blueprintNames(bank: Bank) {
  return {
    domain: Object.fromEntries(bank.blueprint.domains.map((d) => [d.id, d.name])) as Record<string, string>,
    kg: Object.fromEntries(bank.blueprint.kgs.map((k) => [k.id, k.name])) as Record<string, string>,
  };
}
