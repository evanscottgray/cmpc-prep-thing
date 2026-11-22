import type { Session } from '../types';
import { ctx, useDb } from '../ctx';
import { fmtClock, fmtDuration } from '../lib/dates';
import { scaledScore } from '../lib/scoring';
import { Meter, Page } from '../ui/bits';
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

  return (
    <Page title={full ? `${s.title} results` : `${s.title} summary`} backTo="today">
      {full ? (
        <div class="card hero">
          <div class="eyebrow">Tentative result{s.retake ? ' · retake' : ''}</div>
          <div class={`verdict-big ${pass ? 'pass' : 'fail'}`} role="status">
            {pass ? <IcCheckCircle /> : <IcXCircle />}{pass ? 'Pass (estimated)' : 'Did not pass (estimated)'}
          </div>
          <div class="score-line">
            <div><div class="v">{scaled}</div><div class="k">Estimated scaled score (550 passes)</div></div>
            <div><div class="v">{r.raw}<span class="muted" style={{ fontSize: '1rem' }}>/{r.scoredCount}</span></div><div class="k">Raw score (scored items)</div></div>
          </div>
          {s.autoSubmitted && <p class="small mt"><strong>Time ran out</strong> — submitted automatically.</p>}
        </div>
      ) : (
        <div class="card hero">
          <div class="eyebrow">{s.label ?? s.title}</div>
          <div class="score-line">
            <div><div class="v">{r.total ? Math.round((100 * r.correctAll) / r.total) : 0}%</div><div class="k">{r.correctAll} of {r.total} correct</div></div>
            {s.timed && <div><div class="v">{fmtClock(r.timeUsedMs)}</div><div class="k">of {fmtClock(r.durationMs)} used</div></div>}
          </div>
        </div>
      )}

      {(s.retake || (s.kind === 'mixed' && s.seenBefore > 0)) && full && (
        <div class="banner warn mt" role="note"><IcAlert /><div><strong>Not a fresh estimate.</strong> {s.retake && s.kind !== 'mixed' ? `You had taken ${s.title} before.` : `${s.seenBefore} of ${r.total} items were ones you had already seen.`} Familiar items inflate the score.</div></div>
      )}

      <div class="btn-row mt">
        <a class="btn primary" href={`#/review/${s.id}?f=incorrect`}>Review incorrect</a>
        <a class="btn" href={`#/review/${s.id}`}>Review all {r.total}</a>
      </div>

      {full && (
        <div class="section">
          <h2>Percent correct by domain</h2>
          <div class="card bars">
            {bp.domains.map((d) => {
              const a = r.byDomain[d.id]; const p = a?.n ? Math.round((100 * a.c) / a.n) : null;
              return (
                <div class="bar-row">
                  <span class="bar-label">{d.id}. {d.name}</span><span class="bar-val">{p === null ? '—' : `${p}%`} <span class="muted small">({a?.c ?? 0}/{a?.n ?? 0})</span></span>
                  <Meter value={p} label={`Domain ${d.id}`} tick={target} />
                </div>
              );
            })}
            <p class="small muted">Tick mark = your raw passing target ({target}%). The real score report shows domain percentages only to candidates who don't pass.</p>
          </div>
        </div>
      )}

      <div class="section">
        <h2>By knowledge group</h2>
        <div class="card bars">
          {bp.kgs.filter((k) => r.byKg[k.id]?.n).map((k) => {
            const a = r.byKg[k.id]; const p = Math.round((100 * a.c) / a.n);
            return (
              <div class="bar-row">
                <span class="bar-label">{k.id}. {k.name}</span><span class="bar-val">{p}% <span class="muted small">({a.c}/{a.n})</span></span>
                <Meter value={p} label={`Knowledge group ${k.id}`} />
              </div>
            );
          })}
        </div>
      </div>

      <div class="section">
        <h2>Time and pacing</h2>
        <div class="card stat-grid">
          {s.timed && <div class="stat"><div class="v">{fmtDuration(r.timeUsedMs)}</div><div class="k">Time used of {fmtDuration(r.durationMs)}</div></div>}
          {s.timed && <div class="stat"><div class="v">{avgSec}s</div><div class="k">Average per item (target ≤ {bp.exam.secondsPerItem}s)</div></div>}
          <div class="stat"><div class="v">{r.answered}/{r.total}</div><div class="k">Answered</div></div>
          <div class="stat"><div class="v">{r.flagged.n ? `${Math.round((100 * r.flagged.c) / r.flagged.n)}%` : '—'}</div><div class="k">Accuracy on {r.flagged.n} flagged item{r.flagged.n === 1 ? '' : 's'}</div></div>
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
    </Page>
  );
}
