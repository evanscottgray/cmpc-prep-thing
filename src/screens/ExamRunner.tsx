import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../types';
import { ctx, useNow } from '../ctx';
import { navigate } from '../router';
import { choose, goTo, pause, resume, saveScroll, submit, toggleFlag, toggleStrike } from '../lib/actions';
import { fmtClock } from '../lib/dates';
import { isExpired, pacing, remainingMs } from '../lib/scoring';
import { keepAwake } from '../lib/wakelock';
import { OptionList, ReportDialog } from '../ui/question';
import { Modal, alertDialog, confirmDialog } from '../ui/dialog';
import { IcBack, IcChevron, IcClock, IcFlag, IcFlagFill, IcGrid, IcMenu, IcPause, IcPlay } from '../ui/icons';

const WARN_AT = [15, 5, 1]; // minutes remaining

export function ExamRunner({ session: s }: { session: Session }) {
  const now = useNow(500, s.status === 'active' && !s.pausedAt);
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [hideTimer, setHideTimer] = useState(false);
  const [announce, setAnnounce] = useState('');
  const warned = useRef<Set<number>>(new Set());
  const submitting = useRef(false);
  const pos = s.current;
  const si = s.items[pos];
  const item = ctx.items.get(si.id)!;
  const remaining = remainingMs(s, now);
  const isExam = s.kind === 'formA' || s.kind === 'formB' || s.kind === 'mixed';

  // keep the screen awake while the exam runs
  useEffect(() => { keepAwake(true); return () => keepAwake(false); }, []);

  // restore exact scroll position after reload/app switch; save it when leaving
  useEffect(() => {
    if (s.scrollY) requestAnimationFrame(() => window.scrollTo(0, s.scrollY!));
    const save = () => saveScroll(s.id, Math.round(window.scrollY));
    const onVis = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', save); };
  }, [s.id]);
  useEffect(() => { window.scrollTo(0, 0); document.querySelector<HTMLElement>('#q-stem')?.focus({ preventScroll: true }); }, [pos]);

  // time warnings and auto-submit at zero
  useEffect(() => {
    if (s.status !== 'active') return;
    if (isExpired(s, now) && !submitting.current) {
      submitting.current = true;
      submit(s.id, true, now);
      alertDialog({ title: "Time's up", body: 'Your exam was submitted automatically. Unanswered items count as incorrect.', ok: 'See results' })
        .then(() => navigate(`results/${s.id}`, true));
      return;
    }
    const min = remaining / 60000;
    for (const w of WARN_AT) {
      if (min <= w && min > w - 0.5 && !warned.current.has(w) && s.durationMs > w * 60000 * 2) {
        warned.current.add(w);
        setAnnounce(`${w} minute${w > 1 ? 's' : ''} remaining.`);
      }
    }
  }, [now]);

  // hardware-keyboard shortcuts (iPad): ←/→ to move, F to flag
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (navOpen || menuOpen || reportFor || (e.target as HTMLElement)?.closest('input[type=text],textarea')) return;
      if (e.key === 'ArrowRight') goTo(s.id, pos + 1);
      else if (e.key === 'ArrowLeft') goTo(s.id, pos - 1);
      else if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) toggleFlag(s.id, pos);
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [pos, navOpen, menuOpen, reportFor]);

  const answered = Object.keys(s.responses).length;
  const unanswered = s.items.length - answered;
  const flagged = s.flags.length;
  const flaggedHere = s.flags.includes(pos);
  const low = remaining < 5 * 60000;
  const pace = s.mode === 'coached' ? pacing(s, now, ctx.bank.blueprint.exam.secondsPerItem) : null;

  async function endExam() {
    setNavOpen(false); setMenuOpen(false);
    const ok = await confirmDialog({
      title: isExam ? 'End the exam?' : 'Submit this session?',
      body: (
        <div>
          <p>You can't change answers after submitting.</p>
          <ul>
            <li>{answered} of {s.items.length} answered</li>
            {unanswered > 0 && <li><strong>{unanswered} unanswered</strong> (they count as incorrect)</li>}
            {flagged > 0 && <li>{flagged} flagged for review</li>}
            <li>{fmtClock(remaining)} remaining</li>
          </ul>
        </div>
      ),
      ok: isExam ? 'End exam and score' : 'Submit', cancel: 'Keep working', danger: true,
    });
    if (!ok) return;
    submitting.current = true;
    submit(s.id, false);
    navigate(`results/${s.id}`, true);
  }

  async function leave() {
    setMenuOpen(false);
    const ok = await confirmDialog({
      title: 'Leave the exam screen?',
      body: s.mode === 'strict'
        ? 'The timer keeps running while you are away, just like the real exam. Resume from Today at any time.'
        : 'The timer keeps running unless you pause first. Resume from Today at any time.',
      ok: 'Leave', cancel: 'Stay',
    });
    if (ok) navigate('today');
  }

  return (
    <div class="exam">
      <div class="exam-bar">
        <span class="qcount" aria-live="off">Question {pos + 1} <span class="muted">of {s.items.length}</span></span>
        <span class="grow" />
        <button class={`timer icon-btn${low ? ' low' : ''}${hideTimer && !low ? ' hidden-t' : ''}`} style={{ color: 'inherit' }}
          onClick={() => setHideTimer(!hideTimer)} aria-label={`Time remaining ${fmtClock(remaining)}. ${hideTimer ? 'Show' : 'Hide'} timer`}>
          <IcClock />{hideTimer && !low ? 'Show time' : fmtClock(remaining)}
        </button>
        {s.mode === 'coached' && (
          <button class="icon-btn" onClick={() => pause(s.id)} aria-label="Pause"><IcPause /></button>
        )}
        <button class="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Exam menu"><IcMenu /></button>
      </div>
      {pace && (
        <div class="exam-pace" aria-live="off">
          Pace: {pace.answered} answered · target ~{pace.expected} by now ·{' '}
          <strong>{pace.deltaSec >= 0 ? `${fmtClock(pace.deltaSec * 1000)} ahead` : `${fmtClock(-pace.deltaSec * 1000)} behind`}</strong> (47 s/item)
        </div>
      )}
      <div class="sr-only" aria-live="assertive">{announce}</div>

      <main class="exam-body" id="main">
        <div class="row between" style={{ marginBottom: '.6rem' }}>
          <span class="muted small">{s.title}{s.retake ? ' · retake' : ''}</span>
          <button class="btn small flag-btn" aria-pressed={flaggedHere} onClick={() => toggleFlag(s.id, pos)}>
            {flaggedHere ? <IcFlagFill /> : <IcFlag />}{flaggedHere ? 'Flagged' : 'Flag for review'}
          </button>
        </div>
        <p class="stem" id="q-stem" tabIndex={-1}>{item.stem}</p>
        <OptionList item={item} si={si} name={`q${pos}`} selected={s.responses[pos]} struck={s.strikes[pos] ?? []}
          onChoose={(o) => choose(s.id, pos, o)} onStrike={(o) => toggleStrike(s.id, pos, o)} />
      </main>

      <div class="exam-foot">
        <button class="btn prev" onClick={() => goTo(s.id, pos - 1)} disabled={pos === 0}><IcBack />Previous</button>
        <button class="btn" onClick={() => setNavOpen(true)} aria-label={`Review navigator: ${answered} answered, ${unanswered} unanswered, ${flagged} flagged`}><IcGrid />Review</button>
        {pos < s.items.length - 1
          ? <button class="btn next primary" onClick={() => goTo(s.id, pos + 1)}>Next<IcChevron /></button>
          : <button class="btn next primary" onClick={() => setNavOpen(true)}>Finish<IcChevron /></button>}
      </div>

      {navOpen && <Navigator s={s} onClose={() => setNavOpen(false)} onEnd={endExam} />}
      {menuOpen && (
        <Modal title="Exam menu" onClose={() => setMenuOpen(false)}>
          <div class="list">
            <button class="list-item" onClick={() => { setMenuOpen(false); setReportFor(item.id); }}>Report a problem with this question</button>
            <button class="list-item" onClick={leave}>Leave exam screen{s.mode === 'strict' ? ' (timer keeps running)' : ''}</button>
            <button class="list-item" onClick={endExam} style={{ color: 'var(--bad)' }}>{isExam ? 'End exam now' : 'Submit now'}</button>
          </div>
          <p class="small muted mt">Mode: {s.mode === 'strict' ? 'Strict — no pausing, like the real exam.' : 'Coached — pausing allowed, pacing shown.'}</p>
        </Modal>
      )}
      {reportFor && <ReportDialog itemId={reportFor} quiet onClose={() => setReportFor(null)} />}
      {s.pausedAt && (
        <div class="paused-cover" role="dialog" aria-modal="true" aria-labelledby="paused-h">
          <h2 id="paused-h">Paused</h2>
          <p class="muted">Coached mode. The question is hidden while paused.<br />{fmtClock(remaining)} remaining.</p>
          <button class="btn primary" onClick={() => resume(s.id)} autoFocus><IcPlay />Resume</button>
        </div>
      )}
    </div>
  );
}

type NavFilter = 'all' | 'unanswered' | 'flagged';
function Navigator({ s, onClose, onEnd }: { s: Session; onClose: () => void; onEnd: () => void }) {
  const [f, setF] = useState<NavFilter>('all');
  const flags = new Set(s.flags);
  const positions = s.items.map((_, i) => i).filter((i) => f === 'all' || (f === 'flagged' ? flags.has(i) : s.responses[i] === undefined));
  const answered = Object.keys(s.responses).length;
  return (
    <Modal title="Review navigator" onClose={onClose} wide>
      <p class="small muted">{answered} answered · {s.items.length - answered} unanswered · {s.flags.length} flagged</p>
      <div class="chips" role="group" aria-label="Show">
        {(['all', 'unanswered', 'flagged'] as NavFilter[]).map((x) => (
          <button class="chip" aria-pressed={f === x} onClick={() => setF(x)}>{x === 'all' ? 'All' : x === 'unanswered' ? 'Unanswered' : 'Flagged'}</button>
        ))}
      </div>
      <div class="nav-legend" aria-hidden="true">
        <span><i class="swatch answered" />Answered</span>
        <span><i class="swatch" />Unanswered (dashed)</span>
        <span><IcFlagFill class="status-ic" />Flagged</span>
      </div>
      {positions.length === 0 ? <p class="muted">Nothing here.</p> : (
        <div class="nav-grid">
          {positions.map((i) => {
            const a = s.responses[i] !== undefined, fl = flags.has(i);
            return (
              <button class={`nav-cell${a ? ' answered' : ''}${i === s.current ? ' current' : ''}`}
                aria-label={`Question ${i + 1}: ${a ? 'answered' : 'unanswered'}${fl ? ', flagged' : ''}${i === s.current ? ', current' : ''}`}
                onClick={() => { goTo(s.id, i); onClose(); }}>
                {i + 1}{fl && <span class="flag-mark" aria-hidden="true"><IcFlagFill /></span>}
              </button>
            );
          })}
        </div>
      )}
      <div class="btn-row">
        <button class="btn" onClick={onClose}>Back to question</button>
        <button class="btn danger" onClick={onEnd}>End exam…</button>
      </div>
    </Modal>
  );
}
