export type DomainId = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
export type KgId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';
export type Pool = 'A' | 'B' | 'drill';

export interface Item {
  id: string; pool: Pool; scored: boolean; domain: DomainId; kg: KgId; topic: string;
  cog: 'recall' | 'application' | 'analysis'; diff: 1 | 2 | 3; fmt: 'vignette' | 'direct';
  ctx: { setting: string; level: string; delivery: string };
  stem: string; options: string[]; answer: number; rationales: string[]; takeaway: string; refs: string[];
}
export interface Card {
  id: string; kg: KgId; title: string; body: string[]; points?: string[]; examNote: string; refs: string[];
  category?: 'ethics-principle' | 'ethics-standard';
}
export interface Blueprint {
  domains: { id: DomainId; name: string; weight: number }[];
  kgs: { id: KgId; name: string; weight: number }[];
  grid: Record<KgId, Record<DomainId, number>>;
  unscoredPerForm: Record<DomainId, number>;
  exam: { items: number; scored: number; unscored: number; minutes: number; secondsPerItem: number; passScaled: number; scaleMin: number; scaleMax: number; defaultRawTarget: number };
}
export interface Bank {
  version: string; blueprint: Blueprint; items: Item[]; cards: Card[];
  refs: Record<string, { s: string; c: string }>;
}

export type Theme = 'system' | 'light' | 'dark';
export type TextSize = 's' | 'm' | 'l' | 'xl';
export type ExamMode = 'strict' | 'coached';

export interface Settings {
  examDate: string | null;       // YYYY-MM-DD
  rawTarget: number;             // raw passing target mapped to 550
  mode: ExamMode;
  dailyTarget: number;           // questions per day
  textSize: TextSize;
  theme: Theme;
  onboarded: boolean;
  lastBackupAt: number | null;
  backupSnoozeUntil: number | null;
  installDismissed: boolean;     // hide the Add to Home Screen note on Today
  persisted: boolean | null;     // result of navigator.storage.persist()
  celebrations: boolean;         // confetti and motion on success (off = calm)
}

export type AttemptSource = 'exam' | 'block' | 'drill' | 'timed' | 'quiz' | 'review';
export interface Attempt {
  i: string;            // item id
  t: number;            // timestamp (ms)
  ok: boolean;
  src: AttemptSource;
  ms?: number;          // time spent on item
  unsure?: boolean;
  s?: string;           // session id
  na?: boolean;         // left unanswered in a timed session (scored wrong, not counted as studied)
}

export type SessionKind = 'formA' | 'formB' | 'mixed' | 'block' | 'timed' | 'drill' | 'quiz' | 'review';
export interface SessionItem { id: string; scored: boolean; order: number[] } // order[displayPos] = original option index
export interface ExamResult {
  raw: number; scoredCount: number; scaled: number; pass: boolean; rawTarget: number;
  byDomain: Record<string, { c: number; n: number }>;
  byKg: Record<string, { c: number; n: number }>;
  flagged: { c: number; n: number };
  answered: number; total: number; correctAll: number;
  timeUsedMs: number; durationMs: number;
}
export interface Session {
  id: string;
  kind: SessionKind;
  title: string;
  createdAt: number;
  timed: boolean;                 // timed engine (exam/block/timed drill) vs tutor
  mode: ExamMode;                 // strict | coached (timed sessions)
  durationMs: number;             // 0 for untimed
  startedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  items: SessionItem[];
  responses: Record<number, number>;      // position → original option index
  flags: number[];                        // positions
  strikes: Record<number, number[]>;      // position → original option indices struck
  unsure: number[];                       // tutor: positions marked unsure
  revealed: number[];                     // tutor: positions whose rationale was shown
  timeOnItem: Record<number, number>;     // ms
  current: number;
  visitAt: number | null;                 // when current item became visible
  scrollY?: number;
  status: 'active' | 'submitted';
  submittedAt: number | null;
  autoSubmitted: boolean;
  retake: boolean;                        // form taken before / items previously seen
  seenBefore: number;                     // how many items were already seen when assembled
  result: ExamResult | null;
  label?: string;                         // filter description for drills
  reviewedAt?: number;                    // every miss was read through in review, or the learner marked the review done
  opened?: number[];                      // positions opened in review
  reviewPos?: number;                     // last position visited in review, where Today resumes
  reviewLeft?: boolean;                   // the learner moved on from reviewPos (so resuming goes to the next unread miss)
  reviewedRead?: number;                  // when every miss had been read through (not skipped or marked done)
  timerHidden?: boolean;                  // timed: the learner hid the clock for this sitting
  warned?: number[];                      // timed: time warnings (minutes) already given in this sitting
  goalHit?: { pos: number; cheered: boolean; day?: string }; // tutor: the answer that reached the daily goal (on which local day), and whether it got confetti
  updatedAt?: number;
}

export interface SrsEntry { box: number; due: string; last: number } // due YYYY-MM-DD
export interface Report { id: string; itemId: string; kind: string; note: string; at: number; appVersion: string; contentVersion: string }

export interface DbState {
  settings: Settings;
  attempts: Attempt[];
  sessions: Record<string, Session>;
  srs: Record<string, SrsEntry>;        // item id → entry
  cardSrs: Record<string, SrsEntry>;    // card id → entry
  reports: Report[];
  hidden: string[];                      // hidden item ids
  meta: { createdAt: number; schema: number; exposed?: string[]; days?: string[] }; // days: dates with card or review study (answers are dated by attempts) // exposed: items opened in exams that were then discarded
}
