import type { Session } from '../types';
import { ctx, useDb } from '../ctx';
import { fmtClock, fmtDate, fmtDuration, plural, ymd } from '../lib/dates';
import { scaledScore } from '../lib/scoring';
import { missedPositions } from '../lib/actions';
import { focusAreas } from '../lib/stats';
import { DrillSetup } from './Study';
import type { DrillSource } from '../lib/assemble';
import { useState } from 'preact/hooks';
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
  const avgSec = r.answered ? Math.round(r.timeUsedMs / 1000 / Math.max(1, r.total)) : 0;

  const [pick, setPick] = useState<{ title: string; src: DrillSource } | null>(null);
  const missed = missedPositions(s);
  const missedScored = missed.filter((i) => s.items[i].scored).length;
  const gap = Math.round(r.raw - target);
  const focus = focusAreas(ctx.bank, r.byKg);
  const kgs = bp.kgs.filter((k) => r.byKg[k.id]?.n).sort((a, b) => r.byKg[a.id].c / r.byKg[a.id].n - r.byKg[b.id].c / r.byKg[b.id].n || b.weight - a.weight);

  return (
    <Page title={full ? `${s.title} results` : 'Session summary'} backTo={full ? 'progress' : 'today'} wide={full}>
      <div class={full ? 'cols' : undefined}>
      <div>
      {full ? (
        <div class="card hero">
          <div class="eyebrow">Tentative result{s.retake ? ' · retake' : ''}</div>
          <div class="score-line first">
            <div><div class="v">{r.raw}<span class="of">/{r.scoredCount}</span></div><div class="k">Raw score (scored items)</div></div>
            <div><div class="v">{scaled}</div><div class="k">Estimated scaled score (550 passes)</div></div>
          </div>
          <div class={`verdict-big ${pass ? 'pass' : 'fail'}`} role="status">
            {pass ? <IcCheckCircle /> : <IcXCircle />}<span>{pass ? 'Pass (estimated)' : 'Did not pass (estimated)'}</span>
          </div>
          <p class="small muted" style={{ margin: '.25rem 0 0' }}>
            {gap === 0 ? 'Exactly at' : `${Math.abs(gap)} ${gap > 0 ? 'above' : 'below'}`} your practice target of {target}{Math.abs(gap) <= 3 ? ': close enough to go either way' : ''}. {s.submittedAt ? `Taken ${fmtDate(ymd(s.submittedAt))}.` : ''}
          </p>
          {s.autoSubmitted && <p class="small mt" style={{ marginBottom: 0 }}><strong>Time ran out</strong> — submitted automatically.</p>}
        </div>
      ) : (
        <div class="card hero">
          <div class="eyebrow">{s.label ?? s.title}</div>
          <div class="score-line first">
            <div><div class="v">{r.correctAll}<span class="of">/{r.total}</span></div><div class="k">correct{r.total ? ` · ${Math.round((100 * r.correctAll) / r.total)}%` : ''}</div></div>
            {s.timed && <div><div class="v">{fmtClock(r.timeUsedMs)}</div><div class="k">of {fmtClock(r.durationMs)} used</div></div>}
          </div>
          {r.total < s.items.length && <p class="small muted mt" style={{ marginBottom: 0 }}>Ended early. {plural(s.items.length - r.total, 'item')} not answered, and not counted.</p>}
        </div>
      )}

      {(s.retake || (s.kind === 'mixed' && s.seenBefore > 0)) && full && (
        <div class="banner warn mt" role="note"><IcAlert /><div><strong>Not a fresh estimate.</strong> {`${s.seenBefore} of ${r.total} items were ones you had already seen.`} Familiar items inflate the score.</div></div>
      )}

      <div class="btn-row mt">
        {missed.length > 0 && <a class="btn primary" href={`#/review/${s.id}?f=incorrect`}>Review {plural(missed.length, 'miss', 'misses')}</a>}
        {r.total > 0 && <a class={`btn${missed.length ? '' : ' primary'}`} href={`#/review/${s.id}`}>Review all {r.total}</a>}
        {!full && <a class="btn" href="#/today">Done</a>}
      </div>
      {full && missed.length !== missedScored && <p class="small muted mt">{missedScored} of the {missed.length} misses were scored; {missed.length - missedScored} were unscored trial items.</p>}

      {full && focus.length > 0 && (
        <div class="section">
          <h2>Focus next: most points to gain</h2>
          <div class="list">
            {focus.map((k) => <ListLink onClick={() => setPick({ title: `${k.id}. ${k.name}`, src: { type: 'kg', id: k.id } })} title={`${k.id}. ${k.name}`} sub={`${k.acc.n - k.acc.c} of ${k.acc.n} missed · ${k.weight}% of the exam`} right={<span class="badge accent">Drill</span>} />)}
          </div>
        </div>
      )}

      {s.timed && (
        <div class="section">
          <h2>Time and pacing</h2>
          <div class="card stat-grid">
            <div class="stat"><div class="v">{fmtDuration(r.timeUsedMs)}</div><div class="k">Time used of {fmtDuration(r.durationMs)}</div></div>
            <div class="stat"><div class="v">{avgSec} s</div><div class="k">Average per item (target {bp.exam.secondsPerItem} s or less)</div></div>
            <div class="stat"><div class="v">{r.answered}/{r.total}</div><div class="k">Answered</div></div>
            <div class="stat"><div class="v">{r.flagged.n ? `${r.flagged.c}/${r.flagged.n}` : '—'}</div><div class="k">Flagged items correct</div></div>
          </div>
        </div>
      )}
      </div>

      <div>
      {full && (
        <div class="section">
          <h2>Percent correct by domain</h2>
          <div class="card bars">
            {bp.domains.map((d) => <AreaBar label={`${d.id}. ${d.name}`} acc={r.byDomain[d.id]} target={target} href={`#/review/${s.id}?d=${d.id}`} />)}
            <p class="small muted">Mark on each bar: your practice target ({target}%). Tap an area to review its items. The real score report shows domain percentages only to candidates who don't pass.</p>
          </div>
        </div>
      )}

      {kgs.length > 0 && (
        <div class="section">
          <h2>By knowledge group{full ? ', lowest first' : ''}</h2>
          <div class="card bars">
            {kgs.map((k) => <AreaBar label={`${k.id}. ${k.name}`} acc={r.byKg[k.id]} target={target} href={`#/review/${s.id}?k=${k.id}`} />)}
          </div>
        </div>
      )}
      </div>
      </div>

      {full && (
        <div class="banner info mt" role="note">
          <IcInfo />
          <div class="small">
            <strong>This score is an estimate.</strong> AASP doesn't publish the raw passing score, so the app maps your raw score to the 200–800 scale using your raw passing target ({target}/100 → 550; change it in Settings). These practice items aren't calibrated to the real exam, so treat the result as a rough guide, not a prediction.
          </div>
        </div>
      )}
      {pick && <DrillSetup title={pick.title} src={pick.src} onClose={() => setPick(null)} />}
    </Page>
  );
}
