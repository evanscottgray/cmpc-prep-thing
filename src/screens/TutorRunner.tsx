import { useEffect } from 'preact/hooks';
import type { Session } from '../types';
import { ctx } from '../ctx';
import { back, navigate } from '../router';
import { abandon, check, choose, finishTutor, goTo, setUnsure, toggleStrike } from '../lib/actions';
import { ItemActions, ItemMeta, ItemReview, OptionList, StemFold, StrikeHint, Verdict, strikeHint } from '../ui/question';
import { Page } from '../ui/bits';
import { confirmDialog, toast } from '../ui/dialog';

/** Tutor mode: answer, then see the verdict and every rationale before moving on. */
export function TutorRunner({ session: s }: { session: Session }) {
  const pos = s.current;
  const si = s.items[pos];
  const item = ctx.items.get(si.id)!;
  const revealed = s.revealed.includes(pos);
  const resp = s.responses[pos];
  const last = pos === s.items.length - 1;
  const done = s.revealed.length;
  const correct = s.revealed.filter((p) => s.responses[p] === ctx.items.get(s.items[p].id)?.answer).length;

  useEffect(() => { window.scrollTo(0, 0); document.querySelector<HTMLElement>('#q-stem')?.focus({ preventScroll: true }); }, [pos]);
  useEffect(() => { if (revealed) { window.scrollTo(0, 0); document.querySelector<HTMLElement>('#verdict')?.focus({ preventScroll: true }); } }, [revealed]);

  function finish() {
    finishTutor(s.id);
    navigate(`results/${s.id}`, true);
  }
  async function quit() {
    if (done === 0) { abandon(s.id); navigate('study', true); return; }
    const yes = await confirmDialog({ title: 'End this session?', body: `You've answered ${done} of ${s.items.length}. Your answers so far are saved to your progress.`, ok: 'End and see summary', cancel: 'Keep going' });
    if (yes) finish();
  }

  /** Back keeps the session; Today offers to resume it. An untouched session is dropped. */
  function leave() {
    if (done === 0 && !Object.keys(s.responses).length) abandon(s.id);
    else toast('Saved. Resume it from Today.');
    back('study');
  }

  return (
    <Page title={`Question ${pos + 1} of ${s.items.length}`} tabs={false} onBack={leave} right={<button class="icon-btn" onClick={quit}>End</button>}>
      <div class="row between small muted" style={{ marginBottom: '.5rem' }}>
        <span>{s.title}</span>
        {done > 0 && <span>{correct} of {done} correct</span>}
      </div>
      {revealed
        ? <StemFold key={pos} id="q-stem" text={item.stem} />
        : <p class="stem" id="q-stem" tabIndex={-1}>{item.stem}</p>}
      {!revealed ? (
        <>
          <OptionList item={item} si={si} name={`t${s.id}-${pos}`} selected={resp} struck={s.strikes[pos] ?? []}
            onChoose={(o) => choose(s.id, pos, o)} onStrike={(o) => toggleStrike(s.id, pos, o)} />
          {pos === 0 && strikeHint() && <StrikeHint />}
          <ItemActions item={item} />
        </>
      ) : (
        <>
          <Verdict id="verdict" item={item} si={si} response={resp} unsure={s.unsure.includes(pos)} />
          <ItemReview item={item} si={si} response={resp} />
          <ItemMeta item={item} />
        </>
      )}
      <div class="actionbar">
        {!revealed && (
          <label class="check full">
            <input type="checkbox" checked={s.unsure.includes(pos)} onChange={(e) => setUnsure(s.id, pos, (e.target as HTMLInputElement).checked)} />
            I'm not sure<span class="muted small"> (adds to spaced review)</span>
          </label>
        )}
        <button class="btn" disabled={pos === 0} onClick={() => goTo(s.id, pos - 1)}>Previous</button>
        {!revealed
          ? <button class="btn primary" disabled={resp === undefined} onClick={() => check(s.id, pos)}>Check answer</button>
          : last
            ? <button class="btn primary" onClick={finish}>See summary</button>
            : <button class="btn primary" onClick={() => goTo(s.id, pos + 1)}>Next question</button>}
      </div>
    </Page>
  );
}
