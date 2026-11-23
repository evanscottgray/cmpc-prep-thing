import { useState } from 'preact/hooks';
import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { createSession } from '../lib/actions';
import { buildDrill, drillPool, type DrillSource } from '../lib/assemble';
import { fmtShort, ymd } from '../lib/dates';
import { scaledScore } from '../lib/scoring';
import { dueIds } from '../lib/srs';
import { availableItems, examHistory, formTaken, itemStats } from '../lib/stats';
import { ListLink, Page, Seg } from '../ui/bits';
import { Modal, alertDialog } from '../ui/dialog';
import { startQuiz, startReview } from './Today';

type Pick = { title: string; src: DrillSource } | null;

export function Study() {
  const db = useDb();
  const [pick, setPick] = useState<Pick>(null);
  const [chooser, setChooser] = useState<'domain' | 'kg' | null>(null);
  const bp = ctx.bank.blueprint;
  const stats = itemStats(db.attempts);
  const avail = availableItems(ctx.bank, db);
  const count = (src: DrillSource) => drillPool(ctx.bank, db, src).length;
  const due = dueIds(db.srs, ymd(), db.settings.examDate).filter((id) => !db.hidden.includes(id)).length;
  const tookA = formTaken(db, 'formA'), tookB = formTaken(db, 'formB');
  const lastScore = (kind: string) => {
    const s = examHistory(db).filter((x) => x.kind === kind).at(-1);
    return s ? `Estimated ${scaledScore((100 * s.result!.raw) / s.result!.scoredCount, db.settings.rawTarget)} · ${fmtShort(s.submittedAt!)}` : undefined;
  };
  const drill = (title: string, sub: string, src: DrillSource) => {
    const n = count(src);
    return n ? <ListLink onClick={() => setPick({ title, src })} title={title} sub={sub} right={<span class="badge">{n}</span>} />
      : <div class="list-item off"><span class="li-main"><span class="li-title">{title}</span><span class="li-sub" style={{ display: 'block' }}>{sub}</span></span><span class="badge">None yet</span></div>;
  };
  const seen = avail.filter((i) => stats.has(i.id)).length;

  return (
    <Page title="Study" noBack wide>
      <div class="cols">
      <div>
      <div class="section" style={{ marginTop: 0 }}>
        <h2>Full exams</h2>
        <div class="list">
          <ListLink href="#/start/formA" title="Form A" sub={lastScore('formA') ?? 'Best first: your diagnostic'} right={tookA ? <span class="badge ok">Taken</span> : <span class="badge accent">Start here</span>} />
          <ListLink href="#/start/formB" title="Form B" sub={lastScore('formB') ?? 'A second, separate form'} right={tookB ? <span class="badge ok">Taken</span> : undefined} />
          <ListLink href="#/start/mixed" title="Mixed exam" sub={lastScore('mixed') ?? 'Assembled to the blueprint from unseen and weak-area items'} />
        </div>
      </div>
      </div>
      <div class="col-tall">
      <div class="section">
        <h2>Drills</h2>
        <div class="list">
          <ListLink onClick={() => setPick({ title: 'Weakest areas', src: { type: 'weak' } })} title="Weakest areas" sub="Weighted by the blueprint and your current accuracy" right={tookA ? <span class="badge accent">Recommended</span> : undefined} />
          <ListLink onClick={() => setChooser('domain')} title="By domain" sub="Six exam domains" />
          <ListLink onClick={() => setChooser('kg')} title="By knowledge group" sub="Thirteen knowledge groups" />
          {drill('Missed items', 'Last answered wrong', { type: 'missed' })}
          {drill('Flagged items', 'Flagged in timed sessions', { type: 'flagged' })}
          {drill('Unseen items', "Available items you haven't tried", { type: 'unseen' })}
        </div>
      </div>
      </div>
      <div>
      <div class="section">
        <h2>Short sessions</h2>
        <div class="list">
          <ListLink href="#/start/block" title="Exam-pace block" sub="23 items in 18 minutes — a fifth of an exam" />
          <ListLink onClick={startQuiz} title="Quick quiz" sub="10 items for a short phone session" />
          <ListLink onClick={startReview} title="Spaced review" sub="Missed and uncertain items, timed to your exam date" right={due ? <span class="badge accent">{due} due</span> : undefined} />
          <ListLink href="#/cards" title="Concept cards" sub={`${ctx.bank.cards.length} cards with spaced review`} />
        </div>
      </div>
      </div>
      </div>

      <p class="small muted mt">
        {seen} of {avail.length} available items seen. {!tookA || !tookB ? `Items on ${[!tookA && 'Form A', !tookB && 'Form B'].filter(Boolean).join(' and ')} stay unseen until you take ${!tookA && !tookB ? 'them' : 'it'}.` : 'Both forms are now part of your drill pool.'}
      </p>

      {chooser && (
        <Modal title={chooser === 'domain' ? 'Choose a domain' : 'Choose a knowledge group'} onClose={() => setChooser(null)}>
          <div class="list">
            {(chooser === 'domain' ? bp.domains : bp.kgs).map((x) => {
              const src: DrillSource = chooser === 'domain' ? { type: 'domain', id: x.id as any } : { type: 'kg', id: x.id as any };
              return <ListLink onClick={() => { setChooser(null); setPick({ title: chooser === 'domain' ? `Domain ${x.id}: ${x.name}` : x.name, src }); }} title={chooser === 'domain' ? `${x.id}. ${x.name}` : x.name} sub={`${x.weight}% of the exam · ${count(src)} available`} />;
            })}
          </div>
        </Modal>
      )}
      {pick && <DrillSetup title={pick.title} src={pick.src} onClose={() => setPick(null)} />}
    </Page>
  );
}

export function DrillSetup({ title, src, onClose }: { title: string; src: DrillSource; onClose: () => void }) {
  const [mode, setMode] = useState<'tutor' | 'timed'>('tutor');
  const avail = drillPool(ctx.bank, ctx.store.state, src).length;
  const sizes = ['10', '20', '30', '50'].filter((v, i, a) => i === 0 || Number(a[i - 1]) < avail);
  const [n, setN] = useState(sizes.includes('20') ? '20' : '10');
  async function go() {
    const s = buildDrill(ctx.bank, ctx.store.state, src, Number(n), mode === 'timed');
    if (!s) { onClose(); await alertDialog({ title: 'Nothing to drill', body: 'No available items match this choice yet.' }); return; }
    createSession(s);
    if (mode === 'timed') { const st = Date.now(); ctx.store.putSession({ ...s, startedAt: st, visitAt: st }); }
    onClose(); navigate(`s/${s.id}`);
  }
  return (
    <Modal title={title} onClose={onClose}>
      <p class="small muted">{avail} item{avail === 1 ? '' : 's'} available.</p>
      <div class="field"><span class="label" id="dl-n">Items</span>
        <Seg name="n" label="Number of items" value={n} onChange={setN} options={sizes.map((v) => ({ v, label: Number(v) > avail ? `All ${avail}` : v }))} />
      </div>
      <div class="field"><span class="label">Mode</span>
        <Seg name="dm" label="Drill mode" value={mode} onChange={setMode} options={[{ v: 'tutor', label: 'Tutor' }, { v: 'timed', label: 'Timed' }]} />
        <span class="hint">{mode === 'tutor' ? 'See the rationale after each answer.' : `Exam pace: ${ctx.bank.blueprint.exam.secondsPerItem} s per item, feedback at the end.`}</span>
      </div>
      <div class="btn-row">
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" onClick={go} disabled={!avail}>Start</button>
      </div>
    </Modal>
  );
}
