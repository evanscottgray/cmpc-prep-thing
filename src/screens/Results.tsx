import type { Session } from '../types';
import { ctx, useDb } from '../ctx';
import { fmtClock, fmtDate, fmtDuration, plural, ymd } from '../lib/dates';
import { scaledScore } from '../lib/scoring';
import { finishReview, markReadCelebrated, missedPositions, openedMisses, reviewStep } from '../lib/actions';
import { focusAreas, focusLine } from '../lib/stats';
import { DrillSetup } from './Study';
import type { DrillSource } from '../lib/assemble';
import { useEffect, useState } from 'preact/hooks';
import { cardBurst, firstTime, fresh, motionOn } from '../ui/celebrate';
import { todayCount } from '../lib/stats';
import { openQuiz, startQuiz } from './Today';
import { Meter } from '../ui/bits';
import { isLight, plan } from '../lib/plan';
import { AreaBar, ListLink, Page } from '../ui/bits';
import { IcAlert, IcCheckCircle, IcInfo, IcXCircle } from '../ui/icons';

const FULL = new Set(['formA', 'formB', 'mixed']);

export function Results({ session: s }: { session: Session }) {
  const db = useDb();
  const r = s.result!;
  const full = FULL.has(s.kind);
  const bp = ctx.bank.blueprint;
  const target = db.settings.rawTarget;
  // Re-map with the current target so changing the setting updates old reports consistently.
  const pct = r.scoredCount ? (100 * r.raw) / r.scoredCount : 0;
  const scaled = scaledScore(pct, target);
  const pass = pct >= target;
  const times = Object.values(s.timeOnItem).filter((t) => t > 0); // questions actually opened
  const avgSec = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 1000) : null;

  const [pick, setPick] = useState<{ title: string; src: DrillSource } | null>(null);
  const [all, setAll] = useState(false);
  const missed = missedPositions(s);
  const missedScored = missed.filter((i) => s.items[i].scored).length;
  const gap = Math.round(r.raw - target);
  const focus = focusAreas(ctx.bank, r.byKg);
  const pctAll = r.total ? Math.round((100 * r.correctAll) / r.total) : 0;
  // A cheer needs enough answers to mean something; a very short session just says it's saved.
  const cheer = full ? null : r.total < 5 ? { head: 'Session saved', sub: `${plural(r.total, 'answer')} added to your progress.`, emoji: '' }
    : pctAll === 100 ? { head: 'Perfect round!', sub: 'Every answer right.', emoji: '🎯' }
    : pctAll >= 80 ? { head: 'Excellent work!', sub: "You're getting these.", emoji: '🌟' }
    : pctAll >= 60 ? { head: 'Solid session', sub: 'Reading the misses below helps them stick.', emoji: '💪' }
    : { head: 'Good practice', sub: 'The ones you missed come back in spaced review, so they stick.', emoji: '🌱' };
  const light = isLight(plan(db).phase);
  // Familiar questions inflate a score, so a retake's pass is reported, not celebrated; a full run means every question answered.
  const freshForm = !s.retake && s.seenBefore === 0;
  const fullRun = r.answered === r.total;
  // Decided once, on the first render, so the layout (the callout's reserved strip) is right from the first frame.
  // The session's own moment was kept inside its verdict card, so a strong summary still gets its finish.
  const [celebrating] = useState(() => fresh(s.submittedAt) && (full ? pass && freshForm && fullRun : pctAll >= 80 && r.total >= 5) && firstTime(s.id));
  useEffect(() => {
    if (celebrating) return cardBurst(document.querySelector<HTMLElement>(full ? '.exam-pass' : '.card.hero'), true, 300); // inside the card that holds the result
  }, []);
  const glow = celebrating;
  // every miss read through, just now: the hardest work after an exam gets its own moment (once)
  // shown the first time the result opens after the review was finished (however long that takes), once
  const [readAll, setReadAll] = useState(() => s.timed && !!s.reviewedRead && !s.readCelebrated && firstTime(`${s.id}:read`));
  useEffect(() => { if (!readAll) return; markReadCelebrated(s.id); return cardBurst(document.querySelector<HTMLElement>('.review-done'), true, 300); }, [readAll]);
  // after a finished review (or one set aside with every miss read), Done leads and reading again is optional
  const readDone = s.timed && (!!s.reviewedRead || (!!s.reviewedAt && openedMisses(s) === missed.length && missed.length > 0));
  const step = s.timed && !s.reviewedAt && missed.length ? reviewStep(s) : null;
  const finishHere = () => { finishReview(s.id); firstTime(`${s.id}:read`); setReadAll(true); }; // one tap: the moment plays right here
  const today = todayCount(db);
  const T = db.settings.dailyTarget;
  const todayPct = Math.min(100, (100 * today) / Math.max(1, T));
  const sameDay = !!s.submittedAt && ymd(s.submittedAt) === ymd();
  const addedToday = db.attempts.filter((a) => a.s === s.id && !a.na && ymd(a.t) === ymd()).length; // only this session's answers from today
  const reachedToday = today >= T;
  const kgs = bp.kgs.filter((k) => r.byKg[k.id]?.n).sort((a, b) => r.byKg[a.id].c / r.byKg[a.id].n - r.byKg[b.id].c / r.byKg[b.id].n || b.weight - a.weight);

  return (
    <Page title={full ? `${s.title} results` : 'Session summary'} backTo={full ? 'progress' : 'today'} wide={full}>
      <div class={full ? 'cols' : undefined}>
      <div>
      {full ? (
        <div class={`card hero${glow ? ' celebrate' : ''}`}>
          <div class="eyebrow">Practice result, estimated{s.retake ? ' · retake' : ''}</div>
          <div class="score-line first">
            <div><div class="v">{r.raw}<span class="of">/{r.scoredCount}</span></div><div class="k">Raw score (scored questions)</div></div>
            <div><div class="v">{scaled}</div><div class="k">Estimated scaled score (550 passes)</div></div>
          </div>
          {pass ? (
            // a pass gets its own green callout, with room kept for its confetti
            <>
              <div class={`verdict ok exam-pass${glow && motionOn() ? ' room' : ''}`} role="status">
                <IcCheckCircle /><span><span class="pass-head">Pass (estimated)</span>{freshForm && <span class="verdict-sub pass-cheer">Well done.</span>}</span>
              </div>
              <p class="exam-cheer">{!freshForm ? 'Above target on questions you had seen. A fresh form is the real check.' : fullRun ? 'You reached your practice target on a full-length form.' : 'You reached your practice target on this form.'}</p>
            </>
          ) : (
            <>
              <div class="verdict-big fail" role="status"><IcXCircle /><span>Did not pass (estimated)</span></div>
              <p class="exam-cheer">{s.kind === 'formA' && !s.retake ? 'A good baseline. Focus next shows where the points are.' : 'Now you know where the points are. Focus next shows the way.'}</p>
            </>
          )}
          <p class="small muted" style={{ margin: '.25rem 0 0' }}>
            {r.raw}/100 is {gap === 0 ? 'exactly your practice target' : `${Math.abs(gap)} ${gap > 0 ? 'above' : 'below'} your practice target of ${target}`}, which the app places at 550 on its estimated scale. {s.submittedAt ? `Taken ${fmtDate(ymd(s.submittedAt))}.` : ''}
          </p>
          {missed.length !== missedScored && <p class="small muted" style={{ margin: '.5rem 0 0' }}>{missedScored} of your {missed.length} misses were scored; {missed.length - missedScored === 1 ? '1 was an unscored trial question.' : `${missed.length - missedScored} were unscored trial questions.`}</p>}
          {s.autoSubmitted && <p class="small mt" style={{ marginBottom: 0 }}><strong>Time ran out</strong> — submitted automatically.</p>}
        </div>
      ) : (
        <div class={`card hero${glow ? ' celebrate' : ''}`}>
          <div class="eyebrow">{s.title}{s.label ? ` · ${s.label}` : ''}</div>
          {cheer && <div class="cheer">{cheer.emoji && <span class="cheer-emoji" aria-hidden="true">{cheer.emoji}</span>}<div><div class="cheer-head">{cheer.head}</div><div class="small muted">{cheer.sub}</div></div></div>}
          <div class="score-line first">
            <div><div class="v">{r.correctAll}<span class="of">/{r.total}</span></div><div class="k">correct{r.total ? ` · ${pctAll}%` : ''}</div></div>
            {s.timed && <div><div class="v">{fmtClock(r.timeUsedMs)}</div><div class="k">of {fmtClock(r.durationMs)} used</div></div>}
          </div>
          {!s.timed && !light && sameDay && (
            <div class={`today-row${reachedToday ? ' reached' : ''}`}>
              <div class="row between small">
                {reachedToday
                  ? <strong class="goal-done"><span aria-hidden="true">🎉 </span>{s.goalHit?.day === ymd() ? 'This session reached your goal' : 'Daily goal reached'}</strong>
                  : <span>Today: {today} of {T} questions</span>}
                <span class="muted">{reachedToday || !addedToday ? `${today} of ${T}` : `+${addedToday} this session`}</span>
              </div>
              <Meter value={todayPct} label={`Today: ${today} of ${T} questions`} />
            </div>
          )}
          {r.total < s.items.length && <p class="small muted mt" style={{ marginBottom: 0 }}>Ended early. {plural(s.items.length - r.total, 'question')} not answered, and not counted.</p>}
        </div>
      )}

      {readAll && (
        <div class={`verdict ok review-done fresh big mt${motionOn() ? ' room' : ''}`} role="status"><IcCheckCircle /><span><span class="pass-head">{missed.length === 1 ? 'You read your miss' : missed.length === 2 ? 'Both misses read' : `All ${missed.length} misses read`}</span><span class="verdict-sub">{full ? "That's the most useful thing to do after an exam." : "That's the most useful thing to do after timed practice."} Nice work.</span></span></div>
      )}
      {(s.retake || (s.kind === 'mixed' && s.seenBefore > 0)) && full && (
        <div class="banner warn mt" role="note"><IcAlert /><div><strong>Not a fresh estimate.</strong> {`${s.seenBefore} of ${r.total} questions were ones you had already seen.`} Familiar questions inflate the score.</div></div>
      )}

      <div class="btn-row result-actions mt">
        {(!s.timed || readDone) && <a class="btn primary" href="#/today">Done</a>}
        {missed.length > 0 && !readDone && (() => {
          // one next step, the same one Today shows: start with one, continue, resume the last, or finish in one tap
          if (step?.kind === 'finish') return <button class={`btn${s.timed ? ' primary' : ''}`} onClick={finishHere}>Finish review</button>;
          const href = (pos?: number) => `#/review/${s.id}${pos === undefined ? '' : `/${pos}`}?f=incorrect`;
          if (step?.kind === 'resumeLast') return <a class="btn primary" href={href(step.pos)}>Resume last miss</a>;
          if (step?.kind === 'continue') return <a class="btn primary" href={href(step.pos)}>Continue review · {step.opened} of {step.total}</a>;
          if (step?.kind === 'start' && full && step.total > 12) return <a class="btn primary" href={href(step.pos)}>Start with one miss</a>;
          return <a class={`btn${s.timed ? ' primary' : ''}`} href={href()}>Review {plural(missed.length, 'miss', 'misses')}</a>;
        })()}
        {missed.length > 12 && full && !openedMisses(s) && <p class="small muted review-hint">{missed.length} misses to read, one at a time. You can pick up where you left off.</p>}
        {r.total > 0 && <a class={`btn${s.timed && !missed.length ? ' primary' : ''}`} href={`#/review/${s.id}`}>Review all {r.total}</a>}
        {s.timed && !readDone && <a class="btn" href="#/today">Done</a>}
        {readDone && missed.length > 0 && <a class="btn ghost" href={`#/review/${s.id}?f=incorrect`}>{missed.length === 1 ? 'If you want: read the miss again' : 'If you want: read the misses again'}</a>}
        {!s.timed && !full && <button class="btn ghost" onClick={startQuiz}>{(() => { const q = openQuiz(); return q ? `Resume quick quiz · ${q.items.length - q.revealed.length} left` : reachedToday ? 'If you want more: another quick quiz' : 'Another quick quiz · 10'; })()}</button>}
      </div>

      {full && focus.length > 0 && (
        <div class="section">
          <h2>Focus next</h2>
          <div class="small muted focus-note">From this exam. Ranked by how many exam points each group is likely costing you. <details class="how"><summary>How this is ranked</summary>A group's share of the exam times your miss rate in it. Groups with only a few answers are treated cautiously, so a single miss doesn't put a small group at the top.</details></div>
          <div class="list">
            {focus.map((k) => <ListLink onClick={() => setPick({ title: k.name, src: { type: 'kg', id: k.id } })} title={k.name} sub={focusLine(k)} right={<span class="badge accent">Drill</span>} />)}
          </div>
        </div>
      )}
      </div>

      <div class="col-tall">
      {full && (
        <div class="section">
          <h2>Percent correct by domain</h2>
          <div class="card bars">
            <p class="small muted">The mark on each bar is your practice target ({target}%).</p>
            {bp.domains.map((d) => <AreaBar label={`${d.id}. ${d.name}`} acc={r.byDomain[d.id]} target={target} verb="Review" href={`#/review/${s.id}?d=${d.id}&s=1`} />)}
            <p class="small muted">The real score report shows domain percentages only to candidates who don't pass.</p>
          </div>
        </div>
      )}

      {kgs.length > 0 && (full || missed.length > 0) && (
        <div class="section">
          <h2>By knowledge group{kgs.length > 5 ? ', lowest first' : ''}</h2>
          <div class="card bars">
            {(all ? kgs : kgs.slice(0, 5)).map((k) => <AreaBar label={k.name} acc={r.byKg[k.id]} target={target} verb="Review" href={`#/review/${s.id}?k=${k.id}&s=1`} />)}
          {kgs.length > 5 && <button class="btn small block mt" onClick={() => setAll(!all)}>{all ? 'Show lowest five' : `Show all ${kgs.length}`}</button>}
          </div>
        </div>
      )}
      </div>

      <div>
      {s.timed && (
        <div class="section">
          <h2>Time and pacing</h2>
          <div class="card stat-grid">
            <div class="stat"><div class="v">{fmtDuration(r.timeUsedMs)}</div><div class="k">Time used of {fmtDuration(r.durationMs)}</div></div>
            <div class="stat"><div class="v">{avgSec === null ? '—' : `${avgSec} s`}</div><div class="k">Average per question opened (target {bp.exam.secondsPerItem} s or less)</div></div>
            <div class="stat"><div class="v">{r.answered}/{r.total}</div><div class="k">Answered</div></div>
            <div class="stat"><div class="v">{r.flagged.n ? `${r.flagged.c}/${r.flagged.n}` : '—'}</div><div class="k">Correct among questions you flagged</div></div>
          </div>
        </div>
      )}
      </div>
      </div>

      {full && (
        <div class="banner info mt" role="note">
          <IcInfo />
          <div class="small">
            <strong>This score is an estimate.</strong> AASP doesn't publish the raw passing score, so the app maps your raw score to the 200–800 scale using your raw passing target ({target}/100 → 550; change it in Settings). These practice questions aren't calibrated to the real exam, so treat the result as a rough guide, not a prediction.
          </div>
        </div>
      )}
      {pick && <DrillSetup title={pick.title} src={pick.src} onClose={() => setPick(null)} />}
    </Page>
  );
}
