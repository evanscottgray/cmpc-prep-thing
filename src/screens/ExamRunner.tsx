import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../types';
import { ctx, useNow } from '../ctx';
import { navigate } from '../router';
import { choose, goTo, hideItem, pause, resume, saveScroll, submit, toggleFlag, toggleStrike } from '../lib/actions';
import { fmtClock, fmtMinSec } from '../lib/dates';
import { isExpired, pacing, remainingMs } from '../lib/scoring';
import { keepAwake } from '../lib/wakelock';
import { OptionList, QStem, ReportDialog, StrikeHint, strikeHint } from '../ui/question';
import { Modal, alertDialog, clearDialogs, confirmDialog, toast } from '../ui/dialog';
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
      clearDialogs(); setNavOpen(false); setMenuOpen(false); setReportFor(null);
      submit(s.id, true, now);
      alertDialog({ title: "Time's up", body: 'Your exam was submitted automatically. Unanswered questions count as incorrect.', ok: 'See results' })
        .then(() => navigate(`results/${s.id}`, true));
      return;
    }
    const min = remaining / 60000;
    for (const w of WARN_AT) {
      if (min <= w && min > w - 0.5 && !warned.current.has(w) && s.durationMs > w * 60000 * 2) {
        warned.current.add(w);
        setAnnounce(`${w} minute${w > 1 ? 's' : ''} remaining.`);
        toast(`${w} minute${w > 1 ? 's' : ''} remaining`);
      }
    }
  }, [now]);

  // focus follows the pause cover in and out
  const wasPaused = useRef(!!s.pausedAt);
  useEffect(() => {
    if (s.pausedAt) document.getElementById('resume-btn')?.focus();
    else if (wasPaused.current) document.getElementById('pause-btn')?.focus();
    wasPaused.current = !!s.pausedAt;
  }, [s.pausedAt]);

  // hardware-keyboard arrows (iPad) move between questions
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      // a focused answer owns its arrow keys; nothing moves behind a dialog or the pause cover
      if (s.pausedAt || navOpen || menuOpen || reportFor || (e.target as HTMLElement)?.closest?.('input,textarea,select,[role=dialog]') || document.querySelector('[role=dialog]')) return;
      if (e.key === 'ArrowRight') goTo(s.id, pos + 1);
      else if (e.key === 'ArrowLeft') goTo(s.id, pos - 1);
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, [pos, navOpen, menuOpen, reportFor, s.pausedAt]);

  const isHidden = ctx.store.state.hidden.includes(item.id);
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
    if (ok) { saveScroll(s.id, Math.round(window.scrollY)); navigate('today'); }
  }

  const firstTime = pos === 0 && strikeHint(true);

  return (
    <>
    <div class="exam" inert={!!s.pausedAt}>
      <div class="exam-bar">
      <div class="exam-bar-row">
        <span class="qcount" aria-live="off"><span class="qw">Question </span>{pos + 1} <span class="muted">of {s.items.length}</span></span>
        <span class="grow" />
        {low
          ? <span class="timer low" role="timer" aria-label={`Time remaining ${fmtClock(remaining)}`}><IcClock />{fmtClock(remaining)}</span>
          : <button class={`timer icon-btn${hideTimer ? ' btn small' : ''}`} style={{ color: 'inherit' }}
            onClick={() => setHideTimer(!hideTimer)} aria-label={`Time remaining ${fmtClock(remaining)}. ${hideTimer ? 'Show' : 'Hide'} timer`}>
            <IcClock />{hideTimer ? 'Show time' : fmtClock(remaining)}
          </button>}
        {s.mode === 'coached' && (
          <button class="icon-btn framed" id="pause-btn" onClick={() => pause(s.id)} aria-label="Pause"><IcPause /></button>
        )}
        <button class="icon-btn" onClick={() => setMenuOpen(true)} id="exam-menu" aria-label="Exam menu"><IcMenu /></button>
      </div>
      {pace && (
        <div class="exam-pace" aria-live="off">
          <strong>{`${fmtMinSec(Math.abs(pace.deltaSec))} ${pace.deltaSec >= 0 ? 'ahead of' : 'behind'} pace`}</strong> · about 47 s per question
        </div>
      )}
      </div>
      <div class="sr-only" aria-live="assertive">{announce}</div>

      <main class="exam-body" id="main" tabIndex={-1}>
        <QStem text={item.stem} id="q-stem" />
        <OptionList item={item} si={si} name={`q${pos}`} selected={s.responses[pos]} struck={s.strikes[pos] ?? []}
          onChoose={(o) => choose(s.id, pos, o)} onStrike={(o) => toggleStrike(s.id, pos, o)} />
        {firstTime && <StrikeHint />}
      </main>

      <div class="exam-foot">
        <button class="btn prev" onClick={() => goTo(s.id, pos - 1)} disabled={pos === 0} aria-label="Previous"><IcBack /><span class="lbl">Previous</span></button>
        <button class="btn flag-btn" aria-pressed={flaggedHere} aria-label={flaggedHere ? 'Flagged' : 'Flag for review'} onClick={() => toggleFlag(s.id, pos)}>
          {flaggedHere ? <IcFlagFill /> : <IcFlag />}<span class="lbl">{flaggedHere ? 'Flagged' : 'Flag'}</span>
        </button>
        <button class="btn nav" onClick={() => setNavOpen(true)}>
          <IcGrid /><span class="two"><span>Navigator</span> <span class="count">{unanswered} to answer<span class="sr-only">, {flagged} flagged</span></span></span>
        </button>
        {pos < s.items.length - 1
          ? <button class={`btn next${s.responses[pos] === undefined ? '' : ' primary'}`} onClick={() => goTo(s.id, pos + 1)}>{s.responses[pos] === undefined ? 'Skip' : 'Next'}<IcChevron /></button>
          : <button class="btn next primary" onClick={() => setNavOpen(true)}>Finish<IcChevron /></button>}
      </div>

      {navOpen && <Navigator s={s} time={hideTimer && !low ? null : fmtClock(remaining)} low={low} onClose={() => setNavOpen(false)} onEnd={endExam} endLabel={isExam ? 'End exam…' : 'Submit…'} />}
      {menuOpen && (
        <Modal title="Exam menu" onClose={() => setMenuOpen(false)}>
          <div class="list">
            <button class="list-item" onClick={() => { setMenuOpen(false); setReportFor(item.id); }}>Report a problem with this question</button>
            <button class="list-item" onClick={() => { hideItem(item.id, !isHidden); setMenuOpen(false); toast(isHidden ? 'Restored to your study pool.' : 'Hidden from future sessions. It still counts in this one.'); }}>{isHidden ? 'Unhide this question' : 'Hide this question from future sessions'}</button>
            <button class="list-item" onClick={leave}>Leave exam screen{s.mode === 'strict' ? ' (timer keeps running)' : ''}</button>
            <button class="list-item" onClick={endExam} style={{ color: 'var(--bad)' }}>{isExam ? 'End exam now' : 'Submit now'}</button>
          </div>
          <p class="small muted mt">{s.title}{s.retake ? ' (retake)' : ''}. Mode: {s.mode === 'strict' ? 'Strict — no pausing, like the real exam.' : 'Coached — pausing allowed, pacing shown.'}</p>
        </Modal>
      )}
      {reportFor && <ReportDialog itemId={reportFor} quiet onClose={() => setReportFor(null)} />}
    </div>
      {s.pausedAt && (
        <div class="paused-cover" role="dialog" aria-modal="true" aria-labelledby="paused-h">
          <h2 id="paused-h">Paused</h2>
          <p class="muted">Coached mode. The question is hidden while paused.<br />{fmtClock(remaining)} remaining.</p>
          <button class="btn primary" id="resume-btn" onClick={() => resume(s.id)}><IcPlay />Resume</button>
          <button class="btn" onClick={() => { saveScroll(s.id, Math.round(window.scrollY)); navigate('today'); toast('Still paused. Resume it from Today.'); }}>Leave exam screen</button>
        </div>
      )}
    </>
  );
}

type NavFilter = 'all' | 'unanswered' | 'flagged';
function Navigator({ s, time, low, onClose, onEnd, endLabel }: { s: Session; time: string | null; low: boolean; onClose: () => void; onEnd: () => void; endLabel: string }) {
  const [f, setF] = useState<NavFilter>('all');
  const [stop, setStop] = useState(s.current); // the grid's single Tab stop
  const flags = new Set(s.flags);
  const positions = s.items.map((_, i) => i).filter((i) => f === 'all' || (f === 'flagged' ? flags.has(i) : s.responses[i] === undefined));
  const answered = Object.keys(s.responses).length;
  useEffect(() => { document.querySelector('.nav-cell.current')?.scrollIntoView({ block: 'center' }); }, []);
  /** The grid is one Tab stop; arrow keys, Home and End move within it. */
  function gridKeys(e: KeyboardEvent) {
    const cells = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('.nav-cell')];
    const at = cells.indexOf(document.activeElement as HTMLButtonElement); if (at < 0) return;
    const cols = cells.filter((c) => c.offsetTop === cells[0].offsetTop).length;
    const to = ({ ArrowRight: at + 1, ArrowLeft: at - 1, ArrowDown: at + cols, ArrowUp: at - cols, Home: 0, End: cells.length - 1 } as Record<string, number>)[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const t = cells[Math.max(0, Math.min(cells.length - 1, to))];
    setStop(Number(t.dataset.pos));
    t.focus();
  }
  return (
    <Modal title="Navigator" aside={time && <span class={`nav-time${low ? ' low' : ''}`}><IcClock />{time}</span>} onClose={onClose} wide sheet>
      <div class="chips wrap" role="group" aria-label="Show">
        {(['all', 'unanswered', 'flagged'] as NavFilter[]).map((x) => (
          <button class="chip" aria-pressed={f === x} onClick={() => setF(x)}>{x === 'all' ? `All ${s.items.length}` : x === 'unanswered' ? `Unanswered ${s.items.length - answered}` : `Flagged ${s.flags.length}`}</button>
        ))}
      </div>
      <div class="nav-legend" aria-hidden="true">
        <span><i class="swatch answered" />Answered</span>
        <span><i class="swatch" />Unanswered</span>
        <span><IcFlagFill class="status-ic warn" />Flagged</span>
        <span><i class="swatch current" />Current</span>
      </div>
      {positions.length === 0 ? <p class="muted">Nothing here.</p> : (
        <div class="nav-scroll"><div class="nav-grid" role="group" aria-label="Questions. Use arrow keys to move." onKeyDown={gridKeys}>
          {positions.map((i) => {
            const a = s.responses[i] !== undefined, fl = flags.has(i);
            return (
              <button key={i} data-pos={i} tabIndex={i === (positions.includes(stop) ? stop : positions[0]) ? 0 : -1} class={`nav-cell${a ? ' answered' : ''}${fl ? ' flagged' : ''}${i === s.current ? ' current' : ''}`}
                aria-label={`Question ${i + 1}: ${a ? 'answered' : 'unanswered'}${fl ? ', flagged' : ''}${i === s.current ? ', current' : ''}`}
                onClick={() => { goTo(s.id, i); onClose(); }}>
                {i + 1}{fl && <span class="flag-mark" aria-hidden="true"><IcFlagFill /></span>}
              </button>
            );
          })}
        </div></div>
      )}
      <div class="btn-row">
        <button class="btn" onClick={onClose}>Back to question</button>
        <button class="btn danger" onClick={onEnd}>{endLabel}</button>
      </div>
    </Modal>
  );
}

