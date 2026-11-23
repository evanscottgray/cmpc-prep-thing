import { useState } from 'preact/hooks';
import type { Item, SessionItem } from '../types';
import { ctx, useDb } from '../ctx';
import { addReport, hideItem } from '../lib/actions';
import { Modal, toast } from './dialog';
import { IcBug, IcCheck, IcEye, IcEyeOff, IcStrike, IcX } from './icons';

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
              <button type="button" class="strike" aria-pressed={st} aria-label={`${st ? 'Restore' : 'Strike out'} option ${LET[d]}`} onClick={() => onStrike(orig)} disabled={disabled}>
                <IcStrike />
              </button>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}

/** Full review of an item: every option with its rationale, the key, the learner's answer, takeaway and references. */
export function ItemReview({ item, si, response, showActions = true }: { item: Item; si: SessionItem; response: number | undefined; showActions?: boolean }) {
  return (
    <div>
      <ol class="opts" style={{ listStyle: 'none' }} aria-label="Options with explanations">
        {si.order.map((orig, d) => {
          const key = orig === item.answer, mine = response === orig;
          return (
            <li class={`opt${key ? ' is-correct' : mine ? ' is-wrong' : ''}`} key={orig}>
              <div class="opt-main" style={{ cursor: 'default', flexDirection: 'column', gap: 0 }}>
                <div class="row nowrap" style={{ alignItems: 'flex-start', gap: '.75rem' }}>
                  <span class="letter" aria-hidden="true">{LET[d]}</span>
                  <span class="otext"><span class="sr-only">Option {LET[d]}. </span>{item.options[orig]}
                    {(key || mine) && (
                      <span class="opt-tags">
                        {key && <span class="opt-tag ok"><IcCheck />Correct answer</span>}
                        {mine && !key && <span class="opt-tag bad"><IcX />Your answer</span>}
                        {mine && key && <span class="opt-tag you">Your answer</span>}
                      </span>
                    )}
                  </span>
                </div>
                <p class="rationale">{item.rationales[orig]}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div class="takeaway"><strong>Takeaway: </strong>{item.takeaway}</div>
      <References ids={item.refs} />
      {showActions && <ItemActions item={item} />}
    </div>
  );
}

export function References({ ids }: { ids: string[] }) {
  return (
    <div class="refs">
      <strong>References</strong>
      <ul>{ids.map((r) => <li key={r}>{ctx.bank.refs[r]?.c ?? r}</li>)}</ul>
    </div>
  );
}

export function ItemMeta({ item, showTopic = true }: { item: Item; showTopic?: boolean }) {
  return (
    <div class="q-meta">
      {showTopic && <span class="badge accent">{item.topic}</span>}
      <span class="badge">Domain {item.domain}: {ctx.bank.blueprint.domains.find((d) => d.id === item.domain)?.name}</span>
      <span class="badge">KG {item.kg}: {ctx.bank.blueprint.kgs.find((k) => k.id === item.kg)?.name}</span>
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
      <button class="btn small" onClick={() => { hideItem(item.id, !hidden); toast(hidden ? 'Item restored to your study pool.' : 'Item hidden from future sessions.'); }}>
        {hidden ? <><IcEye />Unhide item</> : <><IcEyeOff />Hide this item</>}
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
  const [kind, setKind] = useState('ambiguous');
  const [note, setNote] = useState('');
  return (
    <Modal title="Report a problem" onClose={onClose}>
      <p class="muted small">Item {itemId}. {quiet ? 'Saved for later — nothing about the answer is shown during an exam.' : 'Reports stay on this device until you export them from More → Problem reports.'}</p>
      <fieldset class="opts" style={{ gap: '.35rem' }}>
        <legend class="label" style={{ fontWeight: 600, marginBottom: '.35rem' }}>What's wrong?</legend>
        {KINDS.map((k) => (
          <label class="check" key={k.v}><input type="radio" name="rk" checked={kind === k.v} onChange={() => setKind(k.v)} />{k.label}</label>
        ))}
      </fieldset>
      <label class="field mt">
        <span class="label">Details (optional)</span>
        <textarea class="input" value={note} onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} placeholder="What would make this item right?" />
      </label>
      <div class="btn-row">
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn primary" onClick={() => { addReport(itemId, kind, note.trim()); toast('Report saved.'); onClose(); }}>Save report</button>
      </div>
    </Modal>
  );
}
