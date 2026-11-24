import { useState } from 'preact/hooks';
import type { Item, SessionItem } from '../types';
import { ctx, useDb } from '../ctx';
import { addReport, hideItem } from '../lib/actions';
import { Modal, toast } from './dialog';
import { IcBug, IcCheck, IcCheckCircle, IcEye, IcEyeOff, IcMinusCircle, IcStrike, IcX, IcXCircle } from './icons';

const LET = ['A', 'B', 'C', 'D'];

/** Answerable options: native radios (VoiceOver-friendly) with a separate strike-out toggle per option. */
export function OptionList({ item, si, name, selected, struck, onChoose, onStrike, disabled, allowStrike = true }: {
  item: Item; si: SessionItem; name: string; selected: number | undefined; struck: number[];
  onChoose: (orig: number) => void; onStrike?: (orig: number) => void; disabled?: boolean; allowStrike?: boolean;
}) {
  return (
    <fieldset class="opts">
      <legend class="sr-only">Answer options</legend>
      {si.order.map((orig, d) => {
        const sel = selected === orig, st = struck.includes(orig);
        const id = `${name}-${d}`;
        return (
          <div class={`opt${sel ? ' selected' : ''}${st ? ' struck' : ''}`} key={orig}>
            <label class="opt-main" for={id}>
              <input type="radio" id={id} name={name} checked={sel} disabled={disabled} onChange={() => onChoose(orig)} />
              <span class="letter" aria-hidden="true">{LET[d]}</span>
              <span class="otext"><span class="sr-only">{LET[d]}. {st ? '(struck out) ' : ''}</span>{item.options[orig]}</span>
            </label>
            {allowStrike && onStrike && (
              <button type="button" class="strike" aria-pressed={st} aria-label={`${st ? 'Restore' : 'Strike out'} option ${LET[d]}`} onClick={() => { if (sel && !st) toast('Answer cleared.'); onStrike(orig); }} disabled={disabled}>
                <IcStrike />
              </button>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

/** The stem above feedback. The question itself always shows; the scenario folds on phones and the choice carries over. */
let foldChoice: boolean | null = null;
export function StemFold({ text, id, open }: { text: string; id: string; open?: boolean }) {
  const cut = splitQuestion(text);
  const roomy = window.innerWidth >= 700 && window.innerHeight >= 700;
  const [shown, setShown] = useState(foldChoice ?? (open || roomy));
  if (!cut.lead) return <p class="stem" id={id} tabIndex={-1}>{text}</p>;
  return (
    <div class="stem-fold">
      {shown ? <QStem text={text} id={id} /> : <div class="stem" id={id} tabIndex={-1}><p class="stem-q">{cut.question}</p></div>}
      <button class="icon-btn" aria-expanded={shown} onClick={() => { foldChoice = !shown; setShown(!shown); }}>{shown ? 'Hide scenario' : 'Show scenario'}</button>
    </div>
  );
}
/** The scenario, then the question sentence in its own bold paragraph so it is easy to find. */
export function QStem({ text, id }: { text: string; id: string }) {
  const cut = splitQuestion(text);
  if (!cut.lead) return <p class="stem" id={id} tabIndex={-1}>{text}</p>;
  return (
    <div class="stem" id={id} tabIndex={-1}>
      <p>{cut.lead}</p>
      <p class="stem-q">{cut.question}</p>
    </div>
  );
}
export function splitQuestion(text: string) {
  const m = /^([\s\S]*[.!?]["\u201d]?)\s+([^.!?]*(?:[^.!?]|\.(?=\S))*\?)$/.exec(text.trim());
  return m ? { lead: m[1], question: m[2] } : { lead: '', question: text };
}

/** The result in words: what was chosen and what the answer is, by the letters shown on screen. */
export function Verdict({ item, si, response, unsure, id, fresh, big, extra }: { item: Item; si: SessionItem; response: number | undefined; unsure?: boolean; id?: string; fresh?: boolean; big?: boolean; extra?: { icon: string; text: string }[] }) {
  const ok = response === item.answer;
  const key = LET[si.order.indexOf(item.answer)];
  const [head, detail] = ok ? ['Correct', `The answer is ${key}.`]
    : response === undefined ? ['Not answered', `The answer is ${key}.`]
    : ['Incorrect', `You chose ${LET[si.order.indexOf(response)]}; the answer is ${key}.`];
  return (
    <div id={id} tabIndex={-1} class={`verdict ${ok ? 'ok' : 'bad'}${fresh ? ' fresh' : ''}${fresh && big ? ' big' : ''}`} role={id ? 'status' : undefined}>
      {ok ? <IcCheckCircle /> : response === undefined ? <IcMinusCircle /> : <IcXCircle />}
      <span>{head}<span class="sr-only">. </span><span class="verdict-sub">{detail}{unsure ? ' Marked unsure.' : ''}</span>{extra?.map((x) => <span class="verdict-extra"><span aria-hidden="true">{x.icon} </span>{x.text}</span>)}</span>
    </div>
  );
}

/** Full review of an item: the answer first, then the learner's choice, the takeaway, and the other options. */
export function ItemReview({ item, si, response, showActions = true }: { item: Item; si: SessionItem; response: number | undefined; showActions?: boolean }) {
  const option = (orig: number) => {
    const d = si.order.indexOf(orig);
    const key = orig === item.answer, mine = response === orig;
    return (
      <li class={`opt${key ? ' is-correct' : mine ? ' is-wrong' : ' is-other'}`} key={orig}>
        <div class="opt-main">
          <div class="opt-head">
          <span class="letter" aria-hidden="true">{LET[d]}</span>
          <div class="otext"><span class="sr-only">Option {LET[d]}. </span>{item.options[orig]}
            {(key || mine) && (
              <span class="opt-tags">
                {key && <span class="opt-tag ok"><IcCheck />Correct answer</span>}
                {mine && !key && <span class="opt-tag bad"><IcX />Your answer</span>}
                {mine && key && <span class="opt-tag you">Your answer</span>}
              </span>
            )}
          </div>
          </div>
          <p class="rationale">{item.rationales[orig]}</p>
        </div>
      </li>
    );
  };
  const main = [item.answer, ...(response !== undefined && response !== item.answer ? [response] : [])];
  return (
    <div>
      <ul class="opts plain" aria-label="The answer">{main.map(option)}</ul>
      <div class="takeaway"><strong>Takeaway: </strong>{item.takeaway}</div>
      <h2 class="sub-h">Why not the others</h2>
      <ul class="opts plain" aria-label="The other options">{si.order.filter((o) => !main.includes(o)).map(option)}</ul>
      <References ids={item.refs} />
      {showActions && <ItemActions item={item} />}
    </div>
  );
}

/** Explain the strike-out button until it has been used once. */
/** Shown until strike-out has been used once in this kind of session (timed or tutor). */
export const strikeHint = (timed: boolean) => !Object.values(ctx.store.state.sessions).some((s) => s.timed === timed && Object.keys(s.strikes).length > 0);
export const StrikeHint = () => <p class="strike-hint">Tap <IcStrike /> to cross out an option, and again to restore it. Crossing out your chosen answer clears it.</p>;

export function References({ ids }: { ids: string[] }) {
  return (
    <div class="refs">
      <strong>References</strong>
      <ul>{ids.map((r) => <li key={r}>{ctx.bank.refs[r]?.c ?? r}</li>)}</ul>
    </div>
  );
}

export function ItemMeta({ item }: { item: Item }) {
  const bp = ctx.bank.blueprint;
  return (
    <div class="q-meta">
      <strong>{item.topic}</strong>
      <span>Domain {item.domain}: {bp.domains.find((d) => d.id === item.domain)?.name}<br />Knowledge group {item.kg}: {bp.kgs.find((k) => k.id === item.kg)?.name}</span>
    </div>
  );
}

export function ItemActions({ item }: { item: Item }) {
  const db = useDb();
  const [open, setOpen] = useState(false);
  const hidden = db.hidden.includes(item.id);
  return (
    <div class="q-actions">
      <button class="btn small" onClick={() => setOpen(true)}><IcBug />Report a problem</button>
      <button class="btn small" onClick={() => { hideItem(item.id, !hidden); toast(hidden ? 'Question restored to your study pool.' : 'Question hidden from future sessions.'); }}>
        {hidden ? <><IcEye />Unhide question</> : <><IcEyeOff />Hide this question</>}
      </button>
      {open && <ReportDialog itemId={item.id} onClose={() => setOpen(false)} />}
    </div>
  );
}

const KINDS = [
  { v: 'wrong-key', label: 'The keyed answer seems wrong' },
  { v: 'ambiguous', label: 'More than one option could be best' },
  { v: 'rationale', label: 'Rationale is unclear or incorrect' },
  { v: 'fact', label: 'Factual or citation problem' },
  { v: 'typo', label: 'Typo or wording' },
  { v: 'other', label: 'Something else' },
];
export function ReportDialog({ itemId, onClose, quiet }: { itemId: string; onClose: () => void; quiet?: boolean }) {
  const [kind, setKind] = useState('');
  const [note, setNote] = useState('');
  return (
    <Modal title="Report a problem" onClose={onClose}>
      <p class="muted small">Question {itemId}. {quiet ? 'Saved for later — nothing about the answer is shown during an exam.' : 'Reports stay on this device until you export them from More → Problem reports.'}</p>
      <fieldset class="opts" style={{ gap: '.35rem' }}>
        <legend class="label" style={{ fontWeight: 600, marginBottom: '.35rem' }}>What's wrong?</legend>
        {KINDS.map((k) => (
          <label class="check" key={k.v}><input type="radio" name="rk" checked={kind === k.v} onChange={() => setKind(k.v)} />{k.label}</label>
        ))}
      </fieldset>
      <label class="field mt">
        <span class="label">Details (optional)</span>
        <textarea class="input" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} placeholder="What would make this question right?" />
      </label>
      <div class="btn-row">
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" disabled={!kind} onClick={() => { addReport(itemId, kind, note.trim()); toast('Report saved.'); onClose(); }}>Save report</button>
      </div>
    </Modal>
  );
}
