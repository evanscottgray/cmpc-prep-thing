import { useEffect } from 'preact/hooks';
import type { Session } from '../types';
import { ctx } from '../ctx';
import { navigate } from '../router';
import { check, choose, finishTutor, goTo, setUnsure, toggleStrike } from '../lib/actions';
import { ItemMeta, ItemReview, OptionList } from '../ui/question';
import { Page } from '../ui/bits';
import { confirmDialog } from '../ui/dialog';
import { IcCheckCircle, IcXCircle } from '../ui/icons';

/** Tutor mode: answer, then see the verdict and every rationale before moving on. */
export function TutorRunner({ session: s }: { session: Session }) {
  const pos = s.current;
  const si = s.items[pos];
  const item = ctx.items.get(si.id)!;
  const revealed = s.revealed.includes(pos);
  const resp = s.responses[pos];
  const ok = revealed && resp === item.answer;
  const last = pos === s.items.length - 1;
  const done = s.revealed.length;
  const correct = s.revealed.filter((p) => s.responses[p] === ctx.items.get(s.items[p].id)?.answer).length;

  useEffect(() => { window.scrollTo(0, 0); document.querySelector<HTMLElement>('#q-stem')?.focus({ preventScroll: true }); }, [pos]);
  useEffect(() => { if (revealed) document.querySelector<HTMLElement>('#verdict')?.focus(); }, [revealed]);

  function finish() {
    finishTutor(s.id);
    navigate(`results/${s.id}`, true);
  }
  async function quit() {
    if (done === 0) { navigate('study'); return; }
    const yes = await confirmDialog({ title: 'End this session?', body: `You've answered ${done} of ${s.items.length}. Your answers so far are saved to your progress.`, ok: 'End and see summary', cancel: 'Keep going' });
    if (yes) finish();
  }

  return (
    <Page title={s.title} tabs={false} noBack right={<button class="icon-btn" onClick={quit}>End</button>}>
      <div class="row between small muted" style={{ marginBottom: '.5rem' }}>
        <span>Item {pos + 1} of {s.items.length}</span>
        <span aria-label={`${correct} correct out of ${done} checked`}>{correct}/{done} correct</span>
      </div>
      <ItemMeta item={item} />
      <p class="stem" id="q-stem" tabIndex={-1}>{item.stem}</p>
      {!revealed ? (
        <>
          <OptionList item={item} si={si} name={`t${s.id}-${pos}`} selected={resp} struck={s.strikes[pos] ?? []}
            onChoose={(o) => choose(s.id, pos, o)} onStrike={(o) => toggleStrike(s.id, pos, o)} />
          <label class="check mt">
            <input type="checkbox" checked={s.unsure.includes(pos)} onChange={(e) => setUnsure(s.id, pos, (e.target as HTMLInputElement).checked)} />
            I'm not sure (adds this item to spaced review)
          </label>
        </>
      ) : (
        <>
          <div id="verdict" tabIndex={-1} class={`verdict ${ok ? 'ok' : 'bad'}`} role="status">
            {ok ? <IcCheckCircle /> : <IcXCircle />}
            {ok ? 'Correct' : 'Incorrect'}{s.unsure.includes(pos) ? ' · marked unsure' : ''}
          </div>
          <ItemReview item={item} si={si} response={resp} />
        </>
      )}
      <div class="actionbar">
        {pos > 0 && <button class="btn" onClick={() => goTo(s.id, pos - 1)}>Previous</button>}
        {!revealed
          ? <button class="btn primary" disabled={resp === undefined} onClick={() => check(s.id, pos)}>Check answer</button>
          : last
            ? <button class="btn primary" onClick={finish}>See summary</button>
            : <button class="btn primary" onClick={() => goTo(s.id, pos + 1)}>Next item</button>}
      </div>
    </Page>
  );
}
