import { useState } from 'preact/hooks';
import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { createSession } from '../lib/actions';
import { buildDrill, drillPool, type DrillSource } from '../lib/assemble';
import { ymd } from '../lib/dates';
import { dueIds } from '../lib/srs';
import { availableItems, formTaken, itemStats } from '../lib/stats';
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
  const seen = avail.filter((i) => stats.has(i.id)).length;

  return (
    <Page title="Study" noBack>
      <div class="section" style={{ marginTop: 0 }}>
        <h2>Full exams</h2>
        <div class="list">
          <ListLink href="#/start/formA" title="Form A" sub={tookA ? 'Taken · retakes are not a fresh estimate' : 'Best first: your diagnostic'} right={tookA ? <span class="badge ok">Taken</span> : <span class="badge accent">Start here</span>} />
          <ListLink href="#/start/formB" title="Form B" sub={tookB ? 'Taken' : 'A second, separate form'} right={tookB ? <span class="badge ok">Taken</span> : undefined} />
          <ListLink href="#/start/mixed" title="Mixed exam" sub="Assembled to the blueprint from unseen and weak-area items" />
        </div>
      </div>

      <div class="section">
        <h2>Drills</h2>
        <div class="list">
          <ListLink onClick={() => setPick({ title: 'Weakest areas', src: { type: 'weak' } })} title="Weakest areas" sub="Weighted by the blueprint and your current accuracy" right={<span class="badge accent">Recommended</span>} />
          <ListLink onClick={() => setChooser('domain')} title="By domain" sub="Six exam domains" />
          <ListLink onClick={() => setChooser('kg')} title="By knowledge group" sub="Thirteen knowledge groups" />
          <ListLink onClick={() => setPick({ title: 'Missed items', src: { type: 'missed' } })} title="Missed items" sub={`${count({ type: 'missed' })} items whose last answer was wrong`} />
          <ListLink onClick={() => setPick({ title: 'Flagged items', src: { type: 'flagged' } })} title="Flagged items" sub={`${count({ type: 'flagged' })} items you flagged in timed sessions`} />
          <ListLink onClick={() => setPick({ title: 'Unseen items', src: { type: 'unseen' } })} title="Unseen items" sub={`${count({ type: 'unseen' })} available items you haven't tried`} />
        </div>
      </div>

      <div class="section">
        <h2>Short sessions</h2>
        <div class="list">
          <ListLink href="#/start/block" title="Exam-pace block" sub="23 items in 18 minutes — a fifth of an exam" />
          <ListLink onClick={startQuiz} title="Quick quiz" sub="10 items for a short phone session" />
          <ListLink onClick={startReview} title="Spaced review" sub="Missed and uncertain items, timed to your exam date" right={due ? <span class="badge accent">{due} due</span> : <span class="badge">0 due</span>} />
          <ListLink href="#/cards" title="Concept cards" sub={`${ctx.bank.cards.length} cards with spaced review`} />
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
              return <ListLink onClick={() => { setChooser(null); setPick({ title: `${chooser === 'domain' ? 'Domain' : 'KG'} ${x.id}: ${x.name}`, src }); }} title={`${x.id}. ${x.name}`} sub={`${x.weight}% of the exam · ${count(src)} available`} />;
            })}
          </div>
        </Modal>
      )}
      {pick && <DrillSetup title={pick.title} src={pick.src} onClose={() => setPick(null)} />}
    </Page>
  );
}

function DrillSetup({ title, src, onClose }: { title: string; src: DrillSource; onClose: () => void }) {
  const [n, setN] = useState('20');
  const [mode, setMode] = useState<'tutor' | 'timed'>('tutor');
  const avail = drillPool(ctx.bank, ctx.store.state, src).length;
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
        <Seg name="n" label="Number of items" value={n} onChange={setN} options={['10', '20', '30', '50'].map((v) => ({ v, label: v }))} />
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
