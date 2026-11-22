import type { Session } from '../types';
import { ctx, useDb } from '../ctx';
import { scaledScore } from '../lib/scoring';
import { areaAccuracy, availableItems, examHistory, itemStats, pacingStats, pct, readiness, weightedAccuracy } from '../lib/stats';
import { Meter, Page } from '../ui/bits';
import { IcInfo } from '../ui/icons';

function ScoreChart({ exams, target }: { exams: Session[]; target: number }) {
  const W = 340, H = 180, L = 36, R = 12, T = 12, B = 28;
  const y = (v: number) => T + (H - T - B) * (1 - (v - 200) / 600);
  const x = (i: number) => exams.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (exams.length - 1);
  const pts = exams.map((s, i) => ({ x: x(i), y: y(scaledScore((100 * s.result!.raw) / s.result!.scoredCount, target)), s }));
  const desc = exams.map((s) => `${s.title}${s.retake ? ' (retake)' : ''}: ${scaledScore((100 * s.result!.raw) / s.result!.scoredCount, target)}`).join('; ');
  return (
    <figure class="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Estimated scaled scores over time against the 550 passing line. ${desc}`}>
        {[200, 400, 550, 800].map((v) => (
          <g key={v}><line class={v === 550 ? 'cut' : 'gridline'} x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} text-anchor="end">{v}</text></g>
        ))}
        {pts.length > 1 && <polyline class="line" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />}
        {pts.map((p, i) => <g key={i}><circle class="pt" cx={p.x} cy={p.y} r="5" /><text x={p.x} y={H - 8} text-anchor="middle">{p.s.kind === 'mixed' ? 'Mix' : p.s.title.replace('Form ', '')}{p.s.retake ? '*' : ''}</text></g>)}
      </svg>
      <figcaption class="small muted">Dashed line = 550 (pass). * = retake or included seen items.</figcaption>
    </figure>
  );
}

export function Progress() {
  const db = useDb();
  const bank = ctx.bank;
  const stats = itemStats(db.attempts);
  const last = areaAccuracy(bank, stats, 'last');
  const r = readiness(bank, db);
  const wAcc = weightedAccuracy(bank, last.byDomain);
  const exams = examHistory(db);
  const pace = pacingStats(db);
  const avail = availableItems(bank, db);
  const seen = bank.items.filter((i) => stats.has(i.id)).length;
  const target = db.settings.rawTarget;
  return (
    <Page title="Progress" noBack>
      <div class="card hero">
        <div class="eyebrow">Readiness estimate</div>
        {r.enough ? (
          <>
            <div class="score-line" style={{ marginTop: 0 }}>
              <div><div class="v">{r.scaled}</div><div class="k">Estimated scaled ({r.scaledLo}–{r.scaledHi})</div></div>
              <div><div class="v">{r.raw}%</div><div class="k">Blueprint-weighted, first tries</div></div>
            </div>
            <p class="mt"><span class={`badge ${r.level === 'On track' ? 'ok' : r.level === 'Borderline' ? 'warn' : 'bad'}`}>{r.level}</span></p>
          </>
        ) : <p>Answer at least 60 items (a full exam is ideal) to get an estimate. So far: {r.n}.</p>}
        <p class="small muted" style={{ marginBottom: 0 }}>An estimate, not a prediction: it weights your first-try accuracy by the blueprint and maps it with your raw target ({target}/100 → 550). The real exam's cut score isn't published.</p>
      </div>

      <div class="section">
        <h2>Exam scores</h2>
        <div class="card">{exams.length ? <ScoreChart exams={exams} target={target} /> : <p class="muted" style={{ margin: 0 }}>No full exams yet. Start with Form A.</p>}</div>
      </div>

      <div class="section">
        <h2>Domain mastery</h2>
        <div class="card bars">
          <p class="small muted" style={{ margin: 0 }}>Latest answer on each item. Blueprint-weighted overall: <strong>{wAcc === null ? '—' : `${Math.round(wAcc * 100)}%`}</strong></p>
          {bank.blueprint.domains.map((d) => {
            const a = last.byDomain[d.id]; const p = pct(a);
            return <div class="bar-row"><span class="bar-label">{d.id}. {d.name} <span class="muted small">· {d.weight}%</span></span><span class="bar-val">{p === null ? '—' : `${p}%`} <span class="muted small">({a.n})</span></span><Meter value={p} label={`Domain ${d.id}`} tick={target} /></div>;
          })}
        </div>
      </div>

      <div class="section">
        <h2>Knowledge-group mastery</h2>
        <div class="card bars">
          {bank.blueprint.kgs.map((k) => {
            const a = last.byKg[k.id]; const p = pct(a);
            return <div class="bar-row"><span class="bar-label">{k.id}. {k.name} <span class="muted small">· {k.weight}%</span></span><span class="bar-val">{p === null ? '—' : `${p}%`} <span class="muted small">({a.n})</span></span><Meter value={p} label={`Knowledge group ${k.id}`} tick={target} /></div>;
          })}
        </div>
      </div>

      <div class="section">
        <h2>Pacing and coverage</h2>
        <div class="card stat-grid">
          <div class="stat"><div class="v">{pace ? `${pace.avgSec}s` : '—'}</div><div class="k">Avg per item in timed work (target ≤ {bank.blueprint.exam.secondsPerItem}s)</div></div>
          <div class="stat"><div class="v">{seen}/{bank.items.length}</div><div class="k">Bank items seen</div></div>
          <div class="stat"><div class="v">{avail.filter((i) => stats.has(i.id)).length}/{avail.length}</div><div class="k">Of items available to drill</div></div>
          <div class="stat"><div class="v">{db.attempts.length}</div><div class="k">Total answers</div></div>
        </div>
      </div>
      <div class="banner info mt" role="note"><IcInfo /><div class="small">Mastery uses your latest answer per item; the readiness estimate uses first tries, since the real exam's items are new to you.</div></div>
    </Page>
  );
}
