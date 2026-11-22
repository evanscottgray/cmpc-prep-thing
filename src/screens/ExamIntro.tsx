import { useState } from 'preact/hooks';
import type { ExamMode, Session } from '../types';
import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { abandon, createSession, startSession } from '../lib/actions';
import { buildBlock, buildForm, buildMixed } from '../lib/assemble';
import { formTaken } from '../lib/stats';
import { Page, Seg } from '../ui/bits';
import { confirmDialog } from '../ui/dialog';
import { IcAlert } from '../ui/icons';

type Kind = 'formA' | 'formB' | 'mixed' | 'block';
const TITLES: Record<Kind, string> = { formA: 'Form A', formB: 'Form B', mixed: 'Mixed exam', block: 'Exam-pace block' };

export function ExamIntro({ kind }: { kind: Kind }) {
  const db = useDb();
  const [mode, setMode] = useState<ExamMode>(db.settings.mode);
  const full = kind !== 'block';
  const taken = full && formTaken(db, kind);
  const active = Object.values(db.sessions).find((s) => s.kind === kind && s.status === 'active' && s.startedAt) as Session | undefined;
  const otherActive = Object.values(db.sessions).find((s) => s.kind !== kind && s.status === 'active' && s.startedAt && s.timed && ['formA', 'formB', 'mixed'].includes(s.kind));
  const ex = ctx.bank.blueprint.exam;

  async function start() {
    if (otherActive && full) {
      const ok = await confirmDialog({ title: `${otherActive.title} is still running`, body: 'Starting a new exam will discard the unfinished one (its answers are not scored).', ok: 'Discard and start', danger: true });
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
    const ok = await confirmDialog({ title: 'Discard the unfinished attempt?', body: 'Its answers will not be scored or saved to your progress.', ok: 'Discard', danger: true });
    if (ok) abandon(active.id);
  }

  return (
    <Page title={TITLES[kind]} backTo="study" tabs={false}>
      {active ? (
        <div class="card hero">
          <div class="eyebrow">In progress</div>
          <h2>Your {TITLES[kind]} attempt is still running</h2>
          <p class="muted">The timer has kept going while you were away.</p>
          <div class="btn-row">
            <a class="btn primary" href={`#/s/${active.id}`}>Resume</a>
            <button class="btn danger" onClick={discard}>Discard attempt</button>
          </div>
        </div>
      ) : (
        <>
          <div class="card">
            {full ? (
              <>
                <h2>{kind === 'mixed' ? 'A full exam assembled to the blueprint' : `Full-length practice form`}</h2>
                <ul>
                  <li><strong>{ex.items} items in {ex.minutes} minutes</strong>, one sitting, no breaks (about {ex.secondsPerItem} seconds per item).</li>
                  <li>{ex.unscored} items are unscored trial items you can't identify, as on the real exam. Your score comes from the other {ex.scored}.</li>
                  <li>No feedback until you submit. You can flag items, strike out options, and use the navigator.</li>
                  <li>The timer runs on the clock: it keeps going if you switch apps or close the app, and the exam submits itself at zero.</li>
                  {kind === 'mixed' && <li>Drawn from the drill pool and any forms you've taken, favoring unseen items and your weak areas.</li>}
                </ul>
              </>
            ) : (
              <>
                <h2>A fifth of an exam at real pace</h2>
                <ul>
                  <li><strong>23 items in 18 minutes</strong>, sampled in proportion to the blueprint.</li>
                  <li>No feedback until the end; full review afterwards.</li>
                </ul>
              </>
            )}
          </div>
          {taken && (
            <div class="banner warn mt" role="note"><IcAlert /><div><strong>Retake.</strong> You've taken {TITLES[kind]} before, so this score is <strong>not a fresh estimate</strong> — you've seen these items and their rationales.</div></div>
          )}
          {kind === 'mixed' && <p class="small muted mt">If it includes items you've already seen, the score report will say so.</p>}
          <div class="section">
            <h2>Mode</h2>
            <Seg name="mode" label="Exam mode" value={mode} onChange={setMode} options={[{ v: 'strict', label: 'Strict' }, { v: 'coached', label: 'Coached' }]} />
            <p class="small muted mt">{mode === 'strict' ? 'Strict: no pausing — like the real exam. Recommended.' : 'Coached: you can pause, and a pacing line shows where you are against ~47 s per item.'}</p>
          </div>
          <div class="section">
            <button class="btn primary block" onClick={start}>Start {TITLES[kind]}</button>
            <p class="small muted center mt">Find a quiet place{full ? ' with 90 uninterrupted minutes' : ''}. The screen stays awake where supported.</p>
          </div>
        </>
      )}
    </Page>
  );
}
