import { useState } from 'preact/hooks';
import type { Session } from '../types';
import { ctx, useDb } from '../ctx';
import { scaledScore } from '../lib/scoring';
import type { DrillSource } from '../lib/assemble';
import { fmtShort } from '../lib/dates';
import { areaAccuracy, availableItems, examHistory, focusAreas, focusLine, itemStats, pacingStats, readiness } from '../lib/stats';
import { AreaBar, ListLink, Page } from '../ui/bits';
import { DrillSetup } from './Study';

const scoreOf = (s: Session, target: number) => scaledScore((100 * s.result!.raw) / s.result!.scoredCount, target);
const shortName = (s: Session) => `${s.kind === 'mixed' ? 'Mix' : s.title.replace('Form ', '')}${s.retake ? '*' : ''}`;

/** Lines are drawn in a stretched SVG; labels are HTML so they follow the text-size setting. */
function ScoreChart({ exams, target }: { exams: Session[]; target: number }) {
  const scores = exams.map((s) => scoreOf(s, target));
  const lo = Math.max(200, Math.min(400, ...scores.map((v) => Math.floor((v - 40) / 50) * 50)));
  const hi = Math.min(800, Math.max(700, ...scores.map((v) => Math.ceil((v + 60) / 50) * 50)));
  const y = (v: number) => 100 * (1 - (v - lo) / (hi - lo));
  const x = (i: number) => (exams.length === 1 ? 50 : 10 + (80 * i) / (exams.length - 1));
  const desc = exams.map((s, i) => `${s.title}${s.retake ? ' (retake)' : ''}: ${scores[i]}`).join('; ');
  return (
    <figure class="chart" style={{ margin: 0 }}>
      <div class="chart-area" role="img" aria-label={`Estimated scaled scores over time against the 550 passing line. ${desc}`}>
        <div class="chart-y">{[hi, 550, lo].map((v) => <span class={v === 550 ? 'cut' : undefined} style={{ top: `${y(v)}%` }}>{v}</span>)}</div>
        <div class="chart-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {[lo, hi].map((v) => <line class="gridline" x1="0" x2="100" y1={y(v)} y2={y(v)} />)}
            <line class="cut" x1="0" x2="100" y1={y(550)} y2={y(550)} />
            {exams.length > 1 && <polyline class="line" points={scores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />}
          </svg>
          {scores.map((v, i) => <span class={`chart-pt${v < 550 ? ' low' : ''}`} style={{ left: `${x(i)}%`, top: `${y(v)}%` }}><b>{v}</b></span>)}
        </div>
        <div class="chart-x">{exams.map((s, i) => <span style={{ left: `${x(i)}%` }}>{shortName(s)}</span>)}</div>
      </div>
      <figcaption class="small muted">Estimated scaled scores{exams.length === 6 ? ', last six exams' : ''}. Dashed line: 550, where your practice target of {target} is placed.{exams.some((s) => s.retake) ? ' * Includes questions already seen.' : ''}</figcaption>
    </figure>
  );
}

export function Progress() {
  const db = useDb();
  const bank = ctx.bank;
  const [pick, setPick] = useState<{ title: string; src: DrillSource } | null>(null);
  const [all, setAll] = useState(false);
  const stats = itemStats(db.attempts);
  const last = areaAccuracy(bank, stats, 'last');
  const r = readiness(bank, db);
  const exams = examHistory(db);
  const pace = pacingStats(db);
  const avail = availableItems(bank, db);
  const seen = bank.items.filter((i) => stats.has(i.id)).length;
  const target = db.settings.rawTarget;
  const any = db.attempts.length > 0;
  const focus = focusAreas(bank, last.byKg);
  const rate = (id: string) => (last.byKg[id].n ? last.byKg[id].c / last.byKg[id].n : 2);
  const kgs = [...bank.blueprint.kgs].sort((a, b) => rate(a.id) - rate(b.id) || b.weight - a.weight);
  const range = r.scaledLo >= 550 ? 'Your whole likely range is at or above 550.' : r.scaledHi < 550 ? 'Your whole likely range is below 550.' : 'Your likely range includes 550, so it could go either way.';
  return (
    <Page title="Progress" noBack wide>
      <div class="cols">
      <div>
      <div class="card hero">
        <div class="eyebrow">Readiness estimate</div>
        {r.enough ? (
          <>
            <p class="ready"><span class={`badge big ${r.level === 'On track' ? 'ok' : r.level === 'Borderline' ? 'warn' : 'bad'}`}>{r.level}</span></p>
            <div class="score-line first">
              <div><div class="v">{r.scaled}</div><div class="k">Estimated scaled score, <span class="keep">likely {r.scaledLo}–{r.scaledHi}</span></div></div>
              <div><div class="v">{r.raw}%</div><div class="k">First-try accuracy, blueprint-weighted</div></div>
            </div>
            <p class="small" style={{ margin: '.6rem 0' }}>{range}</p>
          </>
        ) : <p>Answer at least 60 questions (a full exam is ideal) to get an estimate. So far: {r.n}.</p>}
        <p class="small muted" style={{ marginBottom: 0 }}>An estimate, not a prediction. It maps your practice target ({target}/100) to 550; the real exam's cut score isn't published.</p>
      </div>

      {focus.length > 0 && (
        <div class="section">
          <h2>Focus next</h2>
          <p class="small muted">Knowledge groups with the most points to gain: how often you miss them × their share of the exam.</p>
          <div class="list">
            {focus.map((k) => <ListLink onClick={() => setPick({ title: k.name, src: { type: 'kg', id: k.id } })} title={k.name} sub={focusLine(k)} right={<span class="badge accent">Drill</span>} />)}
          </div>
        </div>
      )}

      <div class="section">
        <h2>Exam scores</h2>
        {exams.length ? (
          <>
            <div class="card"><ScoreChart exams={exams.slice(-6)} target={target} /></div>
            <div class="list mt">
              {exams.slice().reverse().map((s) => {
                const v = scoreOf(s, target);
                return <ListLink href={`#/results/${s.id}`} title={s.title} sub={`${fmtShort(s.submittedAt!)} · ${s.result!.raw}/${s.result!.scoredCount}${s.retake ? ' · retake' : ''}`} right={<span class={`badge ${v >= 550 ? 'ok' : 'bad'}`}>{v >= 550 ? 'Pass' : 'Not passing'} · est. {v}</span>} />;
              })}
            </div>
          </>
        ) : <div class="list"><ListLink href="#/start/formA" title="No full exams yet" sub="Start with Form A, your diagnostic" /></div>}
      </div>
      </div>

      <div class="col-tall">
      <div class="section">
        <h2>Domain mastery (latest answers)</h2>
        <div class="card bars">
          {any ? (
            <>
              <p class="small muted">Can run ahead of the first-try readiness estimate. The mark on each bar is your practice target ({target}%).</p>
              {bank.blueprint.domains.map((d) => <AreaBar label={`${d.id}. ${d.name}`} sub={`${d.weight}% of exam`} acc={last.byDomain[d.id]} target={target} verb="Drill" onClick={() => setPick({ title: `${d.id}. ${d.name}`, src: { type: 'domain', id: d.id } })} />)}
            </>
          ) : <p class="muted" style={{ margin: 0 }}>No answers yet. Your accuracy in each area appears here as you study.</p>}
        </div>
      </div>

      {any && (
        <div class="section">
          <h2>Knowledge groups (latest answers), lowest first</h2>
          <div class="card bars">
            {(all ? kgs : kgs.slice(0, 5)).map((k) => <AreaBar label={k.name} sub={`${k.weight}% of exam`} acc={last.byKg[k.id]} target={target} verb="Drill" onClick={() => setPick({ title: k.name, src: { type: 'kg', id: k.id } })} />)}
            <button class="btn small block mt" onClick={() => setAll(!all)}>{all ? 'Show lowest five' : `Show all ${kgs.length}`}</button>
          </div>
        </div>
      )}
      </div>

      <div>
      {any && (
        <div class="section">
          <h2>Pacing and coverage</h2>
          <div class="card stat-grid">
            <div class="stat"><div class="v">{pace ? `${pace.avgSec} s` : '—'}</div><div class="k">Average per timed question (target {bank.blueprint.exam.secondsPerItem} s or less)</div></div>
            <div class="stat"><div class="v">{seen}/{bank.items.length}</div><div class="k">Bank questions seen{avail.length < bank.items.length ? ` (${avail.length} available now)` : ''}</div></div>
            <div class="stat"><div class="v">{db.attempts.length}</div><div class="k">Total answers</div></div>
            <div class="stat"><div class="v">{Object.keys(db.cardSrs).length}/{bank.cards.length}</div><div class="k">Concept cards studied</div></div>
          </div>
        </div>
      )}
      </div>
      </div>
      {pick && <DrillSetup title={pick.title} src={pick.src} onClose={() => setPick(null)} />}
    </Page>
  );
}
