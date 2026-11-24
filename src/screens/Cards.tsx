import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Card } from '../types';
import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { fmtShort, plural, ymd } from '../lib/dates';
import { dueIds, scheduleCard, type Grade } from '../lib/srs';
import { isLight, plan } from '../lib/plan';
import { areaAccuracy, itemStats, smooth } from '../lib/stats';
import { ListLink, Meter, Page } from '../ui/bits';
import { References } from '../ui/question';
import { celebrateSoon } from '../ui/celebrate';
import { markStudied } from '../lib/actions';

const SESSION = 12; // a card session tops up what is due with new cards to this size
const CAT = (c: Card) => c.category === 'ethics-principle' ? 'Ethics principle' : c.category === 'ethics-standard' ? 'Ethics standard' : `${ctx.bank.blueprint.kgs.find((k) => k.id === c.kg)?.name}`;

export function CardsHub({ query }: { query: URLSearchParams }) {
  const db = useDb();
  const q = query.get('q') ?? '', kg = query.get('kg') ?? '';
  const set = (patch: Record<string, string>) => { const n = new URLSearchParams(query); for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); } const t = n.toString(); navigate(`cards${t ? `?${t}` : ''}`, true); };
  const bp = ctx.bank.blueprint;
  const due = dueIds(db.cardSrs, ymd(), db.settings.examDate).length;
  const fresh = ctx.bank.cards.filter((c) => !db.cardSrs[c.id]).length;
  const size = Math.min(25, due + Math.min(fresh, Math.max(0, SESSION - due))), add = Math.max(0, size - due);
  const needle = q.trim().toLowerCase();
  const list = ctx.bank.cards.filter((c) => (!kg || c.kg === kg) && (!needle || `${c.title} ${c.body.join(' ')} ${(c.points ?? []).join(' ')}`.toLowerCase().includes(needle)));
  return (
    <Page title="Concept cards" noBack wide>
      <div class="card hero cards-hero">
        <div class="row between"><div><div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{due ? `${due} due today` : fresh ? `${plural(fresh, 'new card')} to learn` : 'All caught up'}</div><div class="muted small">{due && fresh ? `${plural(fresh, 'card')} not yet studied` : fresh ? `${SESSION} at a time. Recall first, then check yourself.` : 'You have studied every card at least once.'}</div></div></div>
        {(due > 0 || fresh > 0) && <a class="btn primary block mt cap" href="#/cards/study">{due > 0 && add > 0 ? `Study ${size}: ${due} due, ${add} new` : due ? `Review ${plural(size, 'due card')}` : `Study ${plural(add, 'new card')}`}</a>}
      </div>
      <div class="section">
        <div class="filters loose">
        <label class="field"><span class="label">Search cards</span>
          <input class="input" type="search" placeholder={`Search ${ctx.bank.cards.length} cards`} value={q} onInput={(e) => set({ q: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="field"><span class="label">Knowledge group</span>
          <select class="input" value={kg} onChange={(e) => set({ kg: (e.target as HTMLSelectElement).value })}>
            <option value="">All knowledge groups</option>
            {bp.kgs.map((k) => <option value={k.id}>{k.name}</option>)}
          </select>
        </label>
        </div>
        <p class="small muted" aria-live="polite">{plural(list.length, 'card')}</p>
      </div>
      <div class="groups">
      {bp.kgs.map((k) => {
        const group = list.filter((c) => c.kg === k.id);
        return group.length > 0 && (
          <div class="section">
            <h2>{k.name}</h2>
            <div class="list">
              {group.map((c) => {
                const e = db.cardSrs[c.id];
                return <ListLink href={`#/card/${c.id}`} title={c.title} sub={!e || e.due <= ymd() ? undefined : `Next review ${fmtShort(e.due)}`} right={e && e.due <= ymd() ? <span class="badge accent">Due</span> : undefined} />;
              })}
            </div>
          </div>
        );
      })}
      </div>
    </Page>
  );
}

/** Definition first, then what to remember and how it is tested; the fuller explanation follows. */
function CardBody({ c }: { c: Card }) {
  return (
    <div class="concept-body">
      <p class="lead">{c.body[0]}</p>
      {c.points && c.points.length > 0 && <><h3>Key points</h3><ul>{c.points.map((p) => <li>{p}</li>)}</ul></>}
      <div class="exam-note"><strong>On the exam: </strong>{c.examNote}</div>
      {c.body.length > 1 && <><h3>In more depth</h3>{c.body.slice(1).map((p) => <p>{p}</p>)}</>}
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
    </Page>
  );
}

function rate(id: string, g: Grade) {
  const st = ctx.store.state;
  ctx.store.set('cardSrs', { ...st.cardSrs, [id]: scheduleCard(st.cardSrs[id], g, ymd(), st.settings.examDate) });
  markStudied();
}
function RateRow({ id, onRated }: { id: string; onRated: (g: Grade) => void }) {
  return (
    <div class="actionbar" role="group" aria-label="How well did you know this?">
      <button class="btn" onClick={() => { rate(id, 'wrong'); onRated('wrong'); }}>Missed it</button>
      <button class="btn" onClick={() => { rate(id, 'unsure'); onRated('unsure'); }}>Unsure</button>
      <button class="btn" onClick={() => { rate(id, 'right'); onRated('right'); }}>Knew it</button>
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
    const known = ctx.bank.cards.filter((c) => db.cardSrs[c.id]).sort((a, b) => w(b) - w(a)).map((c) => c.id);
    if (isLight(plan(db).phase) && known.length) return [...new Set([...due, ...known])].slice(0, SESSION); // final days: nothing new
    return [...due, ...fresh.slice(0, Math.max(0, SESSION - due.length)).map((c) => c.id)].slice(0, 25);
  }, []);
  const [i, setI] = useState(0);
  const [show, setShow] = useState(false);
  const [tally, setTally] = useState({ right: 0, unsure: 0, wrong: 0 });
  useEffect(() => { if (show) document.getElementById('card-title')?.focus({ preventScroll: true }); }, [show]);
  const c = ctx.bank.cards.find((x) => x.id === queue[i]);
  const rated = tally.right + tally.unsure + tally.wrong;
  const good = rated > 0 && tally.right * 2 >= rated; // celebrate a set where at least half were known
  useEffect(() => { if (!c && good) return celebrateSoon(200); }, [!c]);
  if (!c) return (
    <Page title="Concept cards" backTo="cards" tabs={false}>
      <div class="card hero center">
        {rated > 0 && <div class="cheer-emoji big" aria-hidden="true">{good ? '🎉' : '🌱'}</div>}
        <h2>{queue.length ? (rated ? 'Session complete!' : 'Session complete') : 'Nothing due'}</h2>
        {rated > 0 && <p class="tally"><span><strong>{tally.right}</strong> knew it</span><span><strong>{tally.unsure}</strong> unsure</span><span><strong>{tally.wrong}</strong> missed</span></p>}
        <p class="muted">{!queue.length ? 'All cards are scheduled for later.'
          : !rated ? 'Cards you rate come back on a schedule that fits your exam date.'
          : good ? 'Nice work. The ones you knew come back later; the rest come back sooner.'
          : 'Done. The ones you missed come back sooner, which is how they stick.'}</p>
        <button class="btn primary block" onClick={() => navigate('cards', true)}>Done</button>
      </div>
    </Page>
  );
  return (
    <Page title={`Card ${i + 1} of ${queue.length}`} backTo="cards" tabs={false}>
      <div class="session-progress"><Meter value={(100 * i) / queue.length} label={`${i} of ${queue.length} cards done`} /></div>
      <div class="eyebrow">{CAT(c)}</div>
      <h2 style={{ fontSize: '1.35rem' }} tabIndex={-1} id="card-title">{c.title}</h2>
      {!show ? (
        <>
          <div class="card recall"><p>Before you look, say it in your own words: the definition, an example with a client, and how a scenario might test it.</p></div>
          <div class="actionbar"><button class="btn" onClick={() => { setI(i + 1); window.scrollTo(0, 0); }}>Skip for now</button><button class="btn primary" onClick={() => setShow(true)}>Show card</button></div>
        </>
      ) : (
        <>
          <div class="reveal"><CardBody c={c} /></div>
          <RateRow id={c.id} onRated={(g) => { setTally((t) => ({ ...t, [g]: t[g] + 1 })); setShow(false); setI(i + 1); window.scrollTo(0, 0); }} />
        </>
      )}
    </Page>
  );
}
