import { useState } from 'preact/hooks';
import type { ExamMode, Session } from '../types';
import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { abandon, createSession, startSession } from '../lib/actions';
import { buildBlock, buildForm, buildMixed } from '../lib/assemble';
import { fmtShort } from '../lib/dates';
import { scaledScore } from '../lib/scoring';
import { examHistory, formTaken } from '../lib/stats';
import { Page, Seg } from '../ui/bits';
import { confirmDialog } from '../ui/dialog';
import { IcAlert, IcMenu, IcStrike } from '../ui/icons';

type Kind = 'formA' | 'formB' | 'mixed' | 'block';
const TITLES: Record<Kind, string> = { formA: 'Form A', formB: 'Form B', mixed: 'Mixed exam', block: 'Exam-pace block' };

export function ExamIntro({ kind }: { kind: Kind }) {
  const db = useDb();
  const [mode, setMode] = useState<ExamMode>(db.settings.mode);
  const full = kind !== 'block';
  const exposed = new Set(db.meta.exposed ?? []);
  const formPool = kind === 'formA' ? 'A' : kind === 'formB' ? 'B' : null;
  const opened = formPool ? ctx.bank.items.filter((i) => i.pool === formPool && exposed.has(i.id)).length : 0;
  const taken = full && kind !== 'mixed' && formTaken(db, kind);
  const last = full ? examHistory(db).filter((s) => s.kind === kind).at(-1)
    : Object.values(db.sessions).filter((s) => s.kind === 'block' && s.status === 'submitted' && s.result).sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0)).at(-1); // a block's way back to its result and review
  const active = Object.values(db.sessions).find((s) => s.kind === kind && s.status === 'active' && s.startedAt) as Session | undefined;
  const otherActive = Object.values(db.sessions).find((s) => s.kind !== kind && s.status === 'active' && s.startedAt && s.timed && ['formA', 'formB', 'mixed'].includes(s.kind));
  const ex = ctx.bank.blueprint.exam;

  async function start() {
    if (otherActive && full) {
      const ok = await confirmDialog({ title: `${otherActive.title} is still running`, body: 'Starting a new exam will discard the unfinished one. Its answers are not scored, and questions you opened count as already seen.', ok: 'Discard and start', danger: true });
      if (!ok) return;
      abandon(otherActive.id);
    }
    const s = kind === 'formA' ? buildForm(ctx.bank, db, 'A', mode)
      : kind === 'formB' ? buildForm(ctx.bank, db, 'B', mode)
      : kind === 'mixed' ? buildMixed(ctx.bank, db, mode)
      : buildBlock(ctx.bank, db, mode);
    createSession(s);
    startSession(s.id);
    navigate(`s/${s.id}`, true);
  }
  async function discard() {
    if (!active) return;
    const ok = await confirmDialog({ title: 'Discard the unfinished attempt?', body: 'Its answers will not be scored or saved. Items you opened will count as already seen.', ok: 'Discard', danger: true });
    if (ok) abandon(active.id);
  }

  return (
    <Page title={TITLES[kind]} backTo="study" tabs={false}>
      {active ? (
        <div class="card hero">
          <div class="eyebrow">In progress</div>
          <h2>Your {TITLES[kind]} attempt is {active.pausedAt ? 'paused' : 'still running'}</h2>
          <p class="muted">{active.pausedAt ? 'The timer is paused.' : 'The timer has kept going while you were away.'}</p>
          <div class="btn-row">
            <a class="btn primary" href={`#/s/${active.id}`}>Resume</a>
            <button class="btn danger" onClick={discard}>Discard attempt</button>
          </div>
        </div>
      ) : (
        <>
          {taken && (
            <div class="banner warn" role="note"><IcAlert /><div><strong>Retake.</strong> You've taken {TITLES[kind]} before, so this score is <strong>not a fresh estimate</strong> — you've seen these questions and their rationales.</div></div>
          )}
          {!taken && opened > 0 && (
            <div class="banner warn" role="note"><IcAlert /><div><strong>Partly seen.</strong> You opened {opened} of these questions in an attempt you discarded, so this score is <strong>not a fresh estimate</strong>.</div></div>
          )}
          <div class="card">
            {full ? (
              <>
                <h2>{kind === 'mixed' ? 'A full exam assembled to the blueprint' : `Full-length practice form`}</h2>
                <ul>
                  <li><strong>{ex.items} questions in {ex.minutes} minutes</strong>, one sitting (the real exam has no breaks), about {ex.secondsPerItem} seconds per question.</li>
                  <li>{ex.unscored} questions are unscored trial questions you can't identify, as on the real exam. Your score comes from the other {ex.scored}.</li>
                  {kind === 'mixed' && <li>Drawn from the drill pool and any forms you've taken, favoring unseen questions and your weak areas.</li>}
                </ul>
              </>
            ) : (
              <>
                <h2>A fifth of an exam at real pace</h2>
                <ul>
                  <li><strong>23 questions in 18 minutes</strong>, sampled in proportion to the blueprint.</li>
                </ul>
              </>
            )}
            <h2 class="mt">Mode</h2>
            <Seg name="mode" label="Exam mode" value={mode} onChange={setMode} options={[{ v: 'strict', label: 'Strict' }, { v: 'coached', label: 'Coached' }]} />
            <p class="small muted mt" style={{ marginBottom: 0 }}>{mode === 'strict' ? 'Strict: no pausing — like the real exam. Recommended.' : 'Coached: you can pause, and a pacing line shows where you are against ~47 s per question.'}</p>
          </div>
          <div class="card">
            <h2>During the exam</h2>
            <ul>
              <li>No feedback until you submit{full ? '' : '; full review afterwards'}. You can flag questions, strike out options with <span class="inline-ic"><IcStrike title="the strike-out button" /></span>, and use the navigator.</li>
              <li>The <span class="inline-ic"><IcMenu title="menu" /></span> menu on every question has Report a problem and Hide this question.</li>
              <li>The timer runs on the clock: it keeps going if you switch apps or close the app, and the exam submits itself at zero. Tap it to hide it for this sitting: warnings at {full ? '15, 5 and 1 minutes' : '5 and 1 minutes'} still appear, and the clock comes back for the last 5 minutes.</li>
            </ul>
          </div>
          {last && (full
            ? <a class="btn block mt" href={`#/results/${last.id}`}>View results from {fmtShort(last.submittedAt!)} · estimated {scaledScore((100 * last.result!.raw) / last.result!.scoredCount, db.settings.rawTarget)}</a>
            : <a class="btn block mt" href={`#/results/${last.id}`}>View last block results · {fmtShort(last.submittedAt!)} · {last.result!.correctAll}/{last.result!.total}</a>)}
          {kind === 'mixed' && <p class="small muted mt">If it includes questions you've already seen, the score report will say so.</p>}
          <p class="small muted center mt">Find a quiet place{full ? ' with 90 uninterrupted minutes' : ''}. The screen stays awake where supported.</p>
        </>
      )}
      {!active && <div class="actionbar"><button class="btn primary" onClick={start}>Start {TITLES[kind]} · {mode === 'strict' ? 'Strict' : 'Coached'}</button></div>}
    </Page>
  );
}
