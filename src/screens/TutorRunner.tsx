import { useEffect, useRef, useState } from 'preact/hooks';
import type { Session } from '../types';
import { ctx } from '../ctx';
import { back, navigate } from '../router';
import { abandon, check, choose, finishTutor, goTo, setUnsure, toggleStrike } from '../lib/actions';
import { ItemActions, ItemMeta, ItemReview, OptionList, QStem, StemFold, StrikeHint, Verdict, strikeHint } from '../ui/question';
import { Meter, Page } from '../ui/bits';
import { confirmDialog, toast } from '../ui/dialog';
import { clearConfetti, verdictBurst } from '../ui/celebrate';
import { bestRun, runOfCorrect } from '../lib/streak';
import { todayCount } from '../lib/stats';
import { isLight, plan } from '../lib/plan';

const MILESTONE = (n: number) => n === 3 || n === 5 || (n >= 10 && n % 5 === 0);

/** Tutor mode: answer, then see the verdict and every rationale before moving on. */
export function TutorRunner({ session: s }: { session: Session }) {
  const pos = s.current;
  const si = s.items[pos];
  const item = ctx.items.get(si.id)!;
  const revealed = s.revealed.includes(pos);
  const resp = s.responses[pos];
  const last = pos === s.items.length - 1;
  const done = s.revealed.length;
  const isRight = (p: number) => s.responses[p] === ctx.items.get(s.items[p].id)?.answer;
  const correct = s.revealed.filter(isRight).length;
  // The run as of this question (revisiting an earlier one with Previous shows the run it had then).
  const at = s.revealed.indexOf(pos);
  const run = runOfCorrect(at < 0 ? s.revealed : s.revealed.slice(0, at + 1), isRight);
  const best = bestRun(s.revealed, isRight);
  /** The check just made on this screen: drives the one celebration for that tap and the extra line in the verdict. */
  const [cheer, setCheer] = useState<{ pos: number; lines: { icon: string; text: string }[]; goal: boolean; kind: 'pop' | 'edges' | null } | null>(null);
  const fresh = cheer?.pos === pos;

  useEffect(() => { clearConfetti(); if (cheer && cheer.pos !== pos) setCheer(null); window.scrollTo(0, 0); document.querySelector<HTMLElement>('#q-stem')?.focus({ preventScroll: true }); }, [pos]);
  useEffect(() => clearConfetti, []);
  useEffect(() => { if (revealed) {
    window.scrollTo(0, 0);
    const v = document.querySelector<HTMLElement>('#verdict'); if (!v) return;
    v.focus({ preventScroll: true });
    const bar = document.querySelector('.actionbar')?.getBoundingClientRect().top ?? innerHeight;
    if (v.getBoundingClientRect().bottom > bar - 8) v.scrollIntoView({ block: 'center' }); // keep the result visible above the action bar
  } }, [revealed]);
  const fired = useRef<object | null>(null);
  useEffect(() => {
    const v = document.querySelector('#verdict');
    if (!cheer || !fresh || !revealed || !v || fired.current === cheer) return;
    fired.current = cheer;
    if (cheer.kind) verdictBurst(v as HTMLElement, cheer.kind === 'edges');
  }, [cheer, revealed]);

  /** One celebration per check, biggest moment wins: the daily goal, then a run of 3/5/10…, then a plain correct answer. */
  function onCheck() {
    const st = ctx.store.state;
    const before = todayCount(st);
    check(s.id, pos);
    const after = todayCount(ctx.store.state);
    const target = st.settings.dailyTarget;
    const goal = before < target && after >= target && !isLight(plan(ctx.store.state).phase);
    const ok = isRight(pos);
    const n = ok ? runOfCorrect([...s.revealed, pos], isRight) : 0;
    const lines = ok
      ? goal && MILESTONE(n) ? [{ icon: '🎉', text: `Daily goal reached, and that's ${n} in a row!` }] // one line for one moment
        : MILESTONE(n) ? [{ icon: '🔥', text: `That's ${n} in a row!` }] : goal ? [{ icon: '🎉', text: `Daily goal reached: ${after} today.` }] : []
      : [{ icon: '↻', text: 'This one comes back in spaced review.' }];
    if (goal) ctx.store.putSession({ ...ctx.store.state.sessions[s.id], goalHit: { pos, cheered: ok } });
    // A miss never gets confetti, even when it happens to reach the goal (that shows in its own green note).
    setCheer({ pos, lines, goal, kind: ok && (goal || MILESTONE(n)) ? 'edges' : ok ? 'pop' : null });
  }

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
    <Page title={`Question ${pos + 1} of ${s.items.length}`} tabs={false} closeLabel="Close" onBack={leave} right={done > 0 ? <button class="icon-btn" onClick={quit}>Finish</button> : undefined}>
      <div class="row between small muted" style={{ marginBottom: '.5rem' }}>
        <span>{s.title}</span>
        <span class="row" style={{ gap: '.5rem' }}>
          {fresh && cheer.lines.some((l) => l.text.includes('in a row')) ? null /* the verdict says it this time */ : run >= 3 ? <span class="streak-chip"><span aria-hidden="true">🔥 </span>{run} in a row</span> : best >= 3 && <span class="streak-chip best">Best run: {best}</span>}
          {done > 0 && <span>{correct} of {done} correct</span>}
        </span>
      </div>
      <div class="session-progress"><Meter value={(100 * done) / s.items.length} label={`${done} of ${s.items.length} answered`} /></div>
      {revealed
        ? <StemFold key={pos} id="q-stem" text={item.stem} />
        : <QStem id="q-stem" text={item.stem} />}
      {!revealed ? (
        <>
          <OptionList item={item} si={si} name={`t${s.id}-${pos}`} selected={resp} struck={s.strikes[pos] ?? []}
            onChoose={(o) => choose(s.id, pos, o)} onStrike={(o) => toggleStrike(s.id, pos, o)} />
          {pos === 0 && strikeHint(false) && <StrikeHint />}
          <ItemActions item={item} />
        </>
      ) : (
        <>
          <Verdict id="verdict" item={item} si={si} response={resp} unsure={s.unsure.includes(pos)} fresh={fresh} big={cheer?.kind === 'edges'} extra={fresh ? cheer.lines : undefined} />
          {fresh && cheer.goal && !isRight(pos) && <p class="goal-note" role="status"><span aria-hidden="true">🎉 </span>Daily goal reached: {todayCount(ctx.store.state)} today. Every answer counts, right or wrong.</p>}
          <ItemReview item={item} si={si} response={resp} />
          <ItemMeta item={item} />
        </>
      )}
      <div class="actionbar">
        {!revealed && (
          <label class="check unsure-row">
            <input type="checkbox" checked={s.unsure.includes(pos)} onChange={(e) => setUnsure(s.id, pos, (e.target as HTMLInputElement).checked)} />
            I'm not sure<span class="muted small"> (adds to spaced review)</span>
          </label>
        )}
        {pos > 0 && <button class="btn" onClick={() => goTo(s.id, pos - 1)}>Previous</button>}
        {!revealed
          ? <button class="btn primary" disabled={resp === undefined} onClick={onCheck}>Check answer</button>
          : last
            ? <button class="btn primary" onClick={finish}>See summary</button>
            : <button class="btn primary" onClick={() => goTo(s.id, pos + 1)}>Next question</button>}
      </div>
    </Page>
  );
}
