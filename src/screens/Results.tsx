import type { Session } from '../types';
import { ctx, useDb } from '../ctx';
import { fmtClock, fmtDate, fmtDuration, plural, ymd } from '../lib/dates';
import { scaledScore } from '../lib/scoring';
import { missedPositions } from '../lib/actions';
import { focusAreas, focusLine } from '../lib/stats';
import { DrillSetup } from './Study';
import type { DrillSource } from '../lib/assemble';
import { useEffect, useState } from 'preact/hooks';
import { bigCelebration, fresh } from '../ui/celebrate';
import { CountUp } from '../ui/bits';
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
  const cheer = full ? null : r.total === 0 ? null
    : pctAll === 100 ? { head: 'Perfect round!', sub: 'Every answer right.', emoji: '🎯' }
    : pctAll >= 80 ? { head: 'Excellent work!', sub: "You're getting these.", emoji: '🌟' }
    : pctAll >= 60 ? { head: 'Solid session', sub: 'Read the misses below and they stick.', emoji: '💪' }
    : { head: 'Good practice', sub: "Misses now are points on exam day. They'll come back in spaced review.", emoji: '🌱' };
  useEffect(() => {
    if (!fresh(s.submittedAt)) return;
    if (full ? pass : pctAll >= 70 && r.total >= 5) setTimeout(bigCelebration, 250);
  }, []);
  const kgs = bp.kgs.filter((k) => r.byKg[k.id]?.n).sort((a, b) => r.byKg[a.id].c / r.byKg[a.id].n - r.byKg[b.id].c / r.byKg[b.id].n || b.weight - a.weight);

  return (
    <Page title={full ? `${s.title} results` : 'Session summary'} backTo={full ? 'progress' : 'today'} wide={full}>
      <div class={full ? 'cols' : undefined}>
      <div>
      {full ? (
        <div class="card hero">
          <div class="eyebrow">Practice result, estimated{s.retake ? ' · retake' : ''}</div>
          <div class="score-line first">
            <div><div class="v"><CountUp to={r.raw} run={fresh(s.submittedAt)} /><span class="of">/{r.scoredCount}</span></div><div class="k">Raw score (scored questions)</div></div>
            <div><div class="v">{scaled}</div><div class="k">Estimated scaled score (550 passes)</div></div>
          </div>
          <div class={`verdict-big ${pass ? 'pass' : 'fail'}`} role="status">
            {pass ? <IcCheckCircle /> : <IcXCircle />}<span>{pass ? 'Pass (estimated)' : 'Did not pass (estimated)'}</span>
          </div>
          <p class="small muted" style={{ margin: '.25rem 0 0' }}>
            {r.raw}/100 is {gap === 0 ? 'exactly your practice target' : `${Math.abs(gap)} ${gap > 0 ? 'above' : 'below'} your practice target of ${target}`}, which the app places at 550.{Math.abs(gap) <= 3 ? ' Close enough to go either way.' : ''} {s.submittedAt ? `Taken ${fmtDate(ymd(s.submittedAt))}.` : ''}
          </p>
          {missed.length !== missedScored && <p class="small muted" style={{ margin: '.5rem 0 0' }}>{missedScored} of your {missed.length} misses were scored; {missed.length - missedScored === 1 ? '1 was an unscored trial question.' : `${missed.length - missedScored} were unscored trial questions.`}</p>}
          {s.autoSubmitted && <p class="small mt" style={{ marginBottom: 0 }}><strong>Time ran out</strong> — submitted automatically.</p>}
        </div>
      ) : (
        <div class="card hero">
          <div class="eyebrow">{s.title}{s.label ? ` · ${s.label}` : ''}</div>
          {cheer && <div class="cheer"><span class="cheer-emoji" aria-hidden="true">{cheer.emoji}</span><div><div class="cheer-head">{cheer.head}</div><div class="small muted">{cheer.sub}</div></div></div>}
          <div class="score-line first">
            <div><div class="v"><CountUp to={r.correctAll} run={fresh(s.submittedAt)} /><span class="of">/{r.total}</span></div><div class="k">correct{r.total ? ` · ${pctAll}%` : ''}</div></div>
            {s.timed && <div><div class="v">{fmtClock(r.timeUsedMs)}</div><div class="k">of {fmtClock(r.durationMs)} used</div></div>}
          </div>
          {r.total < s.items.length && <p class="small muted mt" style={{ marginBottom: 0 }}>Ended early. {plural(s.items.length - r.total, 'question')} not answered, and not counted.</p>}
        </div>
      )}

      {(s.retake || (s.kind === 'mixed' && s.seenBefore > 0)) && full && (
        <div class="banner warn mt" role="note"><IcAlert /><div><strong>Not a fresh estimate.</strong> {`${s.seenBefore} of ${r.total} questions were ones you had already seen.`} Familiar questions inflate the score.</div></div>
      )}

      <div class="btn-row result-actions mt">
        {!s.timed && <a class="btn primary" href="#/today">Done</a>}
        {missed.length > 0 && <a class={`btn${s.timed ? ' primary' : ''}`} href={`#/review/${s.id}?f=incorrect`}>Review {plural(missed.length, 'miss', 'misses')}</a>}
        {r.total > 0 && <a class={`btn${s.timed && !missed.length ? ' primary' : ''}`} href={`#/review/${s.id}`}>Review all {r.total}</a>}
        {s.timed && <a class="btn" href="#/today">Done</a>}
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

      {kgs.length > 0 && (
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
