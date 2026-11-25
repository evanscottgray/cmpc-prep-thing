import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Flash, KgId, SrsEntry } from '../types';
import { ctx } from '../ctx';
import { navigate } from '../router';
import { plural } from '../lib/dates';
import { buildRound, flashBank, flashCounts, gradeFlash, isRight, optionOrder, roundStamp } from '../lib/flash';
import { isLight, plan } from '../lib/plan';
import { Meter, Page, Seg } from '../ui/bits';
import { Modal } from '../ui/dialog';
import { IcCheckCircle, IcXCircle } from '../ui/icons';
import { cardBurst, firstTime } from '../ui/celebrate';
import { uid } from '../lib/rng';
import { CardBody } from './Cards';

const LET = ['A', 'B', 'C', 'D'];
const MILESTONE = (n: number) => n === 3 || n === 5 || (n >= 10 && n % 5 === 0);

/** Size and topic for a round, from Study. Today starts a mixed round of 10 directly. */
export function FlashSetup({ onClose }: { onClose: () => void }) {
  const [kg, setKg] = useState<KgId | ''>('');
  const db = ctx.store.state;
  const c = flashCounts(ctx.bank, db, undefined, kg);
  const light = isLight(plan(db).phase);
  const avail = light ? c.practiced : c.total;
  const sizes = ['10', '20'].filter((v, i, a) => i === 0 || Number(a[i - 1]) < avail);
  const [n, setN] = useState('10');
  const size = sizes.includes(n) ? n : sizes[0];
  return (
    <Modal title="Flash drill" onClose={onClose}>
      <p class="small muted">Quick recall: multiple choice and true/false, with the reason after each answer. Separate from your exam scores.</p>
      <label class="field"><span class="label">Topic</span>
        <select class="input" value={kg} onChange={(e) => setKg((e.target as HTMLSelectElement).value as KgId | '')}>
          <option value="">Mixed: all knowledge groups</option>
          {ctx.bank.blueprint.kgs.map((k) => <option value={k.id}>{k.name}</option>)}
        </select>
      </label>
      <p class="small muted" aria-live="polite">{light ? `${plural(c.practiced, 'practised fact')} (final days: no new facts)` : `${plural(c.total, 'fact')} · ${c.due} due · ${c.fresh} new`}</p>
      <div class="field"><span class="label">Facts per round</span>
        <Seg name="fn" label="Facts per round" value={size} onChange={setN} options={sizes.map((v) => ({ v, label: Number(v) > avail ? `All ${avail}` : v }))} />
      </div>
      <div class="btn-row">
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" disabled={!avail} onClick={() => { onClose(); navigate(`flash?n=${size}${kg ? `&kg=${kg}` : ''}`); }}>Start</button>
      </div>
    </Modal>
  );
}

/** `#/flash?n=10&kg=G`. "Another round" remounts the round (navigating to the same address wouldn't). */
export function FlashRunner({ query }: { query: URLSearchParams }) {
  const n = Math.max(1, Math.min(50, Number(query.get('n')) || 10));
  const kg = (query.get('kg') ?? '') as KgId | '';
  const [round, setRound] = useState(0);
  return <FlashRound key={`${round}:${n}:${kg}`} n={n} kg={kg} onAgain={() => setRound((r) => r + 1)} />;
}

interface Slot { id: string; ahead: boolean; retry: boolean }
interface Tally { right: number; up: number; sooner: number; guessed: number; run: number; best: number }

function FlashRound({ n, kg, onAgain }: { n: number; kg: KgId | ''; onAgain: () => void }) {
  const [stamp] = useState(roundStamp);
  const [roundId] = useState(() => uid('fr'));
  const [queue, setQueue] = useState<Slot[]>(() => buildRound(ctx.bank, ctx.store.state, n, kg).map((x) => ({ ...x, retry: false })));
  const [total] = useState(queue.length);
  const [i, setI] = useState(0);
  const [choice, setChoice] = useState<number | boolean | null>(null);
  const [prev, setPrev] = useState<SrsEntry | undefined>(undefined); // this fact's entry from before the answer
  const [guessed, setGuessed] = useState(false);
  const [stale, setStale] = useState(false);
  const [card, setCard] = useState<string | null>(null);
  const [t, setT] = useState<Tally>({ right: 0, up: 0, sooner: 0, guessed: 0, run: 0, best: 0 });
  const slot = queue[i];
  const f = slot && ctx.bank.flash?.find((x) => x.id === slot.id);
  const order = useMemo(() => (f ? optionOrder(f) : []), [i, f?.id]);
  const done = stale || !f;
  const firstTries = queue.slice(0, choice === null ? i : i + 1).filter((s) => !s.retry).length;

  // The prompt takes focus after the page heading does; an answer given before this runs keeps focus on its verdict.
  useEffect(() => { window.scrollTo(0, 0); if (!document.getElementById('flash-verdict')) document.getElementById('flash-prompt')?.focus({ preventScroll: true }); }, [i]);
  useEffect(() => {
    const v = choice !== null && document.getElementById('flash-verdict'); if (!v) return;
    v.focus({ preventScroll: true });
    const bar = document.querySelector('.actionbar')?.getBoundingClientRect().top ?? innerHeight;
    if (v.getBoundingClientRect().bottom > bar - 8) v.scrollIntoView({ block: 'center' }); // keep the result in view above the action bar, as in a quiz
  }, [choice]);

  function answer(c: number | boolean) {
    if (choice !== null || !f || !slot) return;
    const ok = isRight(f, c);
    if (!slot.retry) {
      const before = ctx.store.state.flash.srs[f.id];
      setPrev(before);
      if (!gradeFlash(f.id, ok ? 'right' : 'wrong', before, slot.ahead, stamp)) { setStale(true); return; }
      setT((x) => { const run = ok ? x.run + 1 : 0; return { ...x, right: x.right + (ok ? 1 : 0), up: x.up + (ok && !slot.ahead ? 1 : 0), sooner: x.sooner + (ok ? 0 : 1), run, best: Math.max(x.best, run) }; });
      if (!ok) setQueue((q) => [...q, { id: f.id, ahead: slot.ahead, retry: true }]); // once more at the end of this round
    }
    setChoice(c);
  }
  function guess() {
    if (!f || !gradeFlash(f.id, 'unsure', prev, false, stamp)) { setStale(true); return; }
    setGuessed(true);
    setT((x) => ({ ...x, up: x.up - 1, sooner: x.sooner + 1, guessed: x.guessed + 1 }));
  }
  function next() { setChoice(null); setGuessed(false); setI(i + 1); }

  // T/F, 1–4, Enter. Not while typing, in a dialog, with modifier keys, or on key repeat.
  // The handler is refreshed on every render and the listener attached once, so a key pressed right after a render sees that render.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => { const on = (e: KeyboardEvent) => onKey.current(e); document.addEventListener('keydown', on); return () => document.removeEventListener('keydown', on); }, []);
  {
    onKey.current = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || card || done || !f) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.closest('input, select, textarea, [role="dialog"]'))) return;
      const k = e.key.toLowerCase();
      if (choice === null) {
        if (f.type === 'tf' && (k === 't' || k === 'f')) { e.preventDefault(); answer(k === 't'); }
        else if (f.type === 'mc' && /^[1-4]$/.test(k) && Number(k) <= order.length) { e.preventDefault(); answer(order[Number(k) - 1]); }
      } else if (k === 'enter' && !(el && el.closest('button, a'))) { e.preventDefault(); next(); } // a focused button handles Enter itself
    };
  }

  const good = total >= 5 && t.right * 5 >= total * 4; // 80% right on the first try
  useEffect(() => { if (done && good && !stale && firstTime(roundId)) return cardBurst(document.querySelector<HTMLElement>('.card.hero'), true, 250); }, [done]);

  if (done) {
    const light = isLight(plan(ctx.store.state).phase);
    const empty = total === 0;
    return (
      <Page title="Flash drill" backTo="study" tabs={false}>
        <div class={`card hero${good && !stale ? ' celebrate' : ''}`}>
          <div class="cheer">
            {!empty && !stale && <span class="cheer-emoji" aria-hidden="true">{good ? '🎉' : '🌱'}</span>}
            <div>
              <h2 class="cheer-head" style={{ margin: 0 }}>{stale ? 'Round stopped' : empty ? (light ? 'Nothing practised to review yet' : 'No facts to practise') : good ? 'Round complete!' : 'Round complete'}</h2>
              {!empty && !stale && <div class="small muted">{t.right} of {total} right on the first try{t.best >= 3 ? ` · best run ${t.best}` : ''}</div>}
            </div>
          </div>
          {stale ? <p>Your progress was replaced (a reset or restore, maybe in another tab), so this round stopped saving. Start a new round.</p>
            : empty ? <p class="muted">{light ? 'In the final days the drill only revisits facts you have practised. Light review of concept cards is a good alternative.' : 'There are no flash facts for this choice.'}</p>
            : <>
              <p class="tally left"><span><strong>{t.up}</strong> moved up</span><span><strong>{t.sooner}</strong> back sooner</span></p>
              <p class="muted">{good ? 'Nice work. Facts you knew come back later; the rest come back sooner.' : 'Done. Missed facts come back sooner, which is how they stick.'}</p>
              <p class="small muted">Flash facts count toward your study streak, not the daily question goal or your exam scores.</p>
            </>}
          <div class="btn-row">
            {!empty && <button class="btn" onClick={onAgain}>Another round</button>}
            <button class="btn primary" onClick={() => navigate('study', true)}>Done</button>
          </div>
        </div>
      </Page>
    );
  }

  const answered = choice !== null;
  const ok = answered && isRight(f, choice!);
  const cardTitle = ctx.bank.cards.find((c) => c.id === f.card)?.title;
  const milestone = answered && ok && !slot.retry && MILESTONE(t.run);
  return (
    <Page title={slot.retry ? 'One more try' : `Fact ${firstTries + (answered ? 0 : 1)} of ${total}`} backTo="study" closeLabel="Close" tabs={false}>
      <div class="row between small muted" style={{ marginBottom: '.5rem' }}>
        <span>{ctx.bank.blueprint.kgs.find((k) => k.id === f.kg)?.name}</span>
        <span class="row" style={{ gap: '.5rem' }}>
          {t.run >= 3 && !milestone && <span class="streak-chip"><span aria-hidden="true">🔥 </span>{t.run} in a row</span>}
          <span>{Math.min(firstTries, total)} of {total} facts</span>
        </span>
      </div>
      <div class="session-progress"><Meter value={(100 * Math.min(firstTries, total)) / Math.max(1, total)} label={`${Math.min(firstTries, total)} of ${total} facts answered`} /></div>
      <div class="card flash-card">
        <div class="eyebrow">{f.type === 'tf' ? 'True or false?' : f.prompt.includes('____') ? 'Fill the blank' : 'Quick recall'}</div>
        <p class="flash-prompt" id="flash-prompt" tabIndex={-1}>{f.prompt}</p>
        {!answered && <p class="small muted" style={{ margin: 0 }}>Answer in your head first, then tap.</p>}
      </div>
      {f.type === 'tf'
        ? <div class="tf-row" role="group" aria-label="True or false">
            {[true, false].map((v) => <button class={`btn tf${answered ? (v === f.answer ? ' is-correct' : v === choice ? ' is-wrong' : '') : ''}`} disabled={answered} aria-pressed={answered ? v === choice : undefined} onClick={() => answer(v)}>{v ? 'True' : 'False'}<span class="kbd" aria-hidden="true">{v ? 'T' : 'F'}</span></button>)}
          </div>
        : <div class="opts flash-opts" role="group" aria-label="Answer options">
            {order.map((o, d) => <button class={`opt flash-opt${answered ? (o === f.answer ? ' is-correct' : o === choice ? ' is-wrong' : ' is-other') : ''}`} disabled={answered} onClick={() => answer(o)}>
              <span class="opt-main"><span class="letter" aria-hidden="true">{LET[d]}</span><span class="otext"><span class="sr-only">{LET[d]}. </span>{f.options![o]}</span></span>
            </button>)}
          </div>}
      {answered && <FlashVerdict f={f} ok={ok} retry={slot.retry} guessed={guessed} milestone={milestone ? t.run : 0} />}
      {answered && (
        <div class="row flash-links">
          {cardTitle && <button class="btn ghost small" onClick={() => setCard(f.card)}>Read the concept card</button>}
          {ok && !slot.retry && !slot.ahead && !guessed && <button class="btn ghost small" onClick={guess}>That was a guess</button>}
        </div>
      )}
      <div class="actionbar">
        {answered && <button class="btn primary" onClick={next}>{i + 1 >= queue.length ? 'See summary' : 'Next'}</button>}
        {!answered && <span class="small muted flash-hint">{f.type === 'tf' ? 'Keys: T or F' : `Keys: 1–${order.length}`}</span>}
      </div>
      {card && (() => { const c = ctx.bank.cards.find((x) => x.id === card); return c && (
        <Modal title={c.title} onClose={() => setCard(null)} wide>
          <CardBody c={c} />
          <div class="btn-row"><button class="btn primary" onClick={() => setCard(null)}>Back to the drill</button></div>
        </Modal>
      ); })()}
    </Page>
  );
}

function FlashVerdict({ f, ok, retry, guessed, milestone }: { f: Flash; ok: boolean; retry: boolean; guessed: boolean; milestone: number }) {
  const key = f.type === 'tf' ? (f.answer ? 'True' : 'False') : f.options![f.answer as number];
  return (
    <div id="flash-verdict" tabIndex={-1} role="status" class={`verdict ${ok ? 'ok' : 'bad'}`}>
      {ok ? <IcCheckCircle /> : <IcXCircle />}
      <span>{ok ? 'Correct' : 'Not quite'}<span class="sr-only">. </span>
        <span class="verdict-sub">
          {f.type === 'tf' ? `The statement is ${f.answer ? 'true' : 'false'}.` : <>The answer is <strong>{key}</strong>.</>}
        </span>
        {f.correction && <span class="verdict-sub flash-correction"><strong>{f.correction}</strong></span>}
        <span class="verdict-sub">{f.explain}</span>
        {milestone > 0 && <span class="verdict-extra"><span aria-hidden="true">🔥 </span>That's {milestone} in a row!</span>}
        {!ok && !retry && <span class="verdict-extra"><span aria-hidden="true">↻ </span>This one comes back at the end of the round.</span>}
        {guessed && <span class="verdict-extra"><span aria-hidden="true">↻ </span>Noted as a guess: it comes back sooner.</span>}
      </span>
    </div>
  );
}

export const hasFlash = () => flashBank(ctx.bank).length > 0;
