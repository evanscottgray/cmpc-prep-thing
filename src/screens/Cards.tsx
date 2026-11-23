import { useMemo, useState } from 'preact/hooks';
import type { Card } from '../types';
import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { ymd } from '../lib/dates';
import { dueIds, scheduleCard, type Grade } from '../lib/srs';
import { areaAccuracy, itemStats, smooth } from '../lib/stats';
import { ListLink, Page } from '../ui/bits';
import { References } from '../ui/question';

const CAT = (c: Card) => c.category === 'ethics-principle' ? 'Ethics principle' : c.category === 'ethics-standard' ? 'Ethics standard' : `${c.kg}. ${ctx.bank.blueprint.kgs.find((k) => k.id === c.kg)?.name}`;

export function CardsHub({ query }: { query: URLSearchParams }) {
  const db = useDb();
  const [q, setQ] = useState('');
  const kg = query.get('kg') ?? '';
  const bp = ctx.bank.blueprint;
  const due = dueIds(db.cardSrs, ymd(), db.settings.examDate).length;
  const fresh = ctx.bank.cards.filter((c) => !db.cardSrs[c.id]).length;
  const needle = q.trim().toLowerCase();
  const list = ctx.bank.cards.filter((c) => (!kg || c.kg === kg) && (!needle || `${c.title} ${c.body.join(' ')} ${(c.points ?? []).join(' ')}`.toLowerCase().includes(needle)));
  return (
    <Page title="Concept cards" noBack>
      <div class="card hero">
        <div class="row between"><div><div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{due}</div><div class="muted small">due today · {fresh} not yet studied</div></div></div>
        <a class="btn primary block mt" href="#/cards/study">{due ? 'Review due cards' : 'Study new cards'}</a>
      </div>
      <div class="section">
        <label class="field"><span class="sr-only">Search cards</span>
          <input class="input" type="search" placeholder="Search cards" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        </label>
        <label class="field"><span class="sr-only">Knowledge group</span>
          <select class="input" value={kg} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; navigate(v ? `cards?kg=${v}` : 'cards', true); }}>
            <option value="">All knowledge groups</option>
            {bp.kgs.map((k) => <option value={k.id}>{k.id}. {k.name}</option>)}
          </select>
        </label>
        <p class="small muted" aria-live="polite">{list.length} cards</p>
        <div class="list">
          {list.map((c) => {
            const e = db.cardSrs[c.id];
            return <ListLink href={`#/card/${c.id}`} title={c.title} sub={`${CAT(c)}${e ? ` · next ${e.due <= ymd() ? 'today' : e.due}` : ' · new'}`} />;
          })}
        </div>
      </div>
    </Page>
  );
}

function CardBody({ c }: { c: Card }) {
  return (
    <div class="concept-body">
      {c.body.map((p) => <p>{p}</p>)}
      {c.points && c.points.length > 0 && <ul>{c.points.map((p) => <li>{p}</li>)}</ul>}
      <div class="exam-note"><strong>On the exam: </strong>{c.examNote}</div>
      <References ids={c.refs} />
    </div>
  );
}

export function CardDetail({ id }: { id: string }) {
  const c = ctx.bank.cards.find((x) => x.id === id);
  if (!c) return <Page title="Card" backTo="cards"><p>Card not found.</p></Page>;
  return (
    <Page title="Concept card" backTo="cards">
      <div class="eyebrow">{CAT(c)}</div>
      <h2 style={{ fontSize: '1.35rem' }}>{c.title}</h2>
      <CardBody c={c} />
      <RateRow id={c.id} />
    </Page>
  );
}

function rate(id: string, g: Grade) {
  const st = ctx.store.state;
  ctx.store.set('cardSrs', { ...st.cardSrs, [id]: scheduleCard(st.cardSrs[id], g, ymd(), st.settings.examDate) });
}
function RateRow({ id, onRated }: { id: string; onRated?: () => void }) {
  return (
    <div class="actionbar" role="group" aria-label="How well did you know this?">
      <button class="btn" onClick={() => { rate(id, 'wrong'); onRated?.(); }}>Didn't know</button>
      <button class="btn" onClick={() => { rate(id, 'unsure'); onRated?.(); }}>Unsure</button>
      <button class="btn primary" onClick={() => { rate(id, 'right'); onRated?.(); }}>Knew it</button>
    </div>
  );
}

/** Due cards first, then new cards from the knowledge groups that are heaviest on the blueprint and weakest for you. */
export function CardStudy() {
  const db = ctx.store.state;
  const queue = useMemo(() => {
    const due = dueIds(db.cardSrs, ymd(), db.settings.examDate);
    const { byKg } = areaAccuracy(ctx.bank, itemStats(db.attempts), 'last');
    const w = (c: Card) => (ctx.bank.blueprint.kgs.find((k) => k.id === c.kg)?.weight ?? 1) * (1 - smooth(byKg[c.kg] ?? { c: 0, n: 0 })) * (0.75 + Math.random() * 0.5);
    const fresh = ctx.bank.cards.filter((c) => !db.cardSrs[c.id]).sort((a, b) => w(b) - w(a));
    return [...due, ...fresh.slice(0, Math.max(0, 12 - due.length)).map((c) => c.id)].slice(0, 25);
  }, []);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const c = ctx.bank.cards.find((x) => x.id === queue[i]);
  if (!c) return (
    <Page title="Concept cards" backTo="cards" tabs={false}>
      <div class="card hero center">
        <h2>{queue.length ? 'Session complete' : 'Nothing due'}</h2>
        <p class="muted">{queue.length ? `You reviewed ${queue.length} cards. They'll come back on a schedule that fits your exam date.` : 'All cards are scheduled for later.'}</p>
        <button class="btn primary" onClick={() => navigate('cards', true)}>Done</button>
      </div>
    </Page>
  );
  return (
    <Page title={`Card ${i + 1} of ${queue.length}`} backTo="cards" tabs={false}>
      <div class="eyebrow">{CAT(c)}</div>
      <h2 style={{ fontSize: '1.35rem' }} tabIndex={-1} id="card-title">{c.title}</h2>
      {!show ? (
        <>
          <p class="muted">Recall what you can about this topic — the key idea, how it applies, and how it might appear in a scenario — then reveal the card.</p>
          <div class="actionbar"><button class="btn primary" onClick={() => setShow(true)}>Show card</button></div>
        </>
      ) : (
        <>
          <CardBody c={c} />
          <RateRow id={c.id} onRated={() => { setShow(false); setI(i + 1); window.scrollTo(0, 0); }} />
        </>
      )}
    </Page>
  );
}
