import { useEffect, useState } from 'preact/hooks';
import { ctx, useDb, useNow } from '../ctx';
import { navigate } from '../router';
import { abandon, createSession, finishReview, markReviewed, missedPositions, nextMiss, openedMisses, reviewStep } from '../lib/actions';
import { REVIEW_MAX, buildDrill, buildQuiz, buildReview } from '../lib/assemble';
import { fmtDate, fmtShort, plural, ymd } from '../lib/dates';
import { isLight, plan, type Action } from '../lib/plan';
import type { DbState, Session } from '../types';
import { dueIds } from '../lib/srs';
import { lastWeek, streak, studyDays } from '../lib/streak';
import { ListLink, Meter, Page } from '../ui/bits';
import { alertDialog, confirmDialog, toast } from '../ui/dialog';
import { IcAlert, IcChevron, IcInfo, IcPhone, IcX } from '../ui/icons';

const WEEK = 7 * 86400000;

export function startWeak(count: number) {
  const s = buildDrill(ctx.bank, ctx.store.state, { type: 'weak' }, count, false, Date.now(), Date.now(), 'drill', 'Weak-area drill');
  if (!s) return alertDialog({ title: 'Nothing to drill yet', body: 'No available questions match.' });
  createSession(s); navigate(`s/${s.id}`);
}
export function startReview() {
  const s = buildReview(ctx.bank, ctx.store.state, dueIds(ctx.store.state.srs, ymd(), ctx.store.state.settings.examDate));
  if (!s) return alertDialog({ title: 'No reviews due', body: 'Missed and uncertain questions come back here on a schedule that fits the time left before your exam.' });
  createSession(s); navigate(`s/${s.id}`);
}
export const openQuiz = () => Object.values(ctx.store.state.sessions).filter((x) => x.kind === 'quiz' && x.status === 'active' && x.revealed.length < x.items.length && (x.revealed.length > 0 || Object.keys(x.responses).length > 0)).sort((a, b) => b.createdAt - a.createdAt)[0];
export function startQuiz() {
  const open = openQuiz();
  if (open) return navigate(`s/${open.id}`);
  const s = buildQuiz(ctx.bank, ctx.store.state);
  createSession(s); navigate(`s/${s.id}`);
}

/** The recommended exam review: one next step, the same one Results shows. */
function reviewCard(x: Session) {
  const st = reviewStep(x);
  const open = (pos?: number) => navigate(`review/${x.id}${pos === undefined ? '' : `/${pos}`}?f=incorrect`);
  const finish = () => { finishReview(x.id); navigate(`results/${x.id}`); }; // its moment plays on the result
  const skip = { label: st.kind === 'start' ? 'Skip this review' : 'Skip remaining misses', go: () => { markReviewed(x.id); toast(`Done. ${x.title} stays under Progress if you want it later.`); } };
  const base = { ctaFirst: true, eyebrow: 'Recommended', title: `Review your ${x.title} misses` };
  if (st.kind === 'finish') return { ...base, cta: 'Finish review', go: finish, note: 'Every miss is read. Finish to wrap it up.' };
  if (st.kind === 'resumeLast') return { ...base, cta: 'Resume last miss', go: () => open(st.pos), second: { label: 'Finish review', go: finish } };
  if (st.kind === 'continue') return { ...base, cta: `Continue review · ${st.opened} of ${st.total}`, go: () => open(st.pos), second: skip };
  return { ...base, cta: st.total > 12 ? 'Start with one miss' : `Review ${plural(st.total, 'miss', 'misses')}`, go: () => open(st.pos), note: st.total > 12 ? 'Read one explanation now. You can pick up where you left off.' : undefined, second: skip };
}

const SHORT = { get label() { const q = openQuiz(); return q ? `Or resume your quick quiz · ${q.items.length - q.revealed.length} left` : 'Or warm up with 10 untimed questions'; }, go: () => startQuiz() };

function Primary({ a, why, later, firstVisit }: { a: Action; why: string; later?: boolean; firstVisit?: boolean }) {
  // The very first session: an untimed warm-up builds momentum; the 90-minute diagnostic is one tap away.
  // Left partway, the warm-up stays the main way back until it's finished.
  const warm = a.kind === 'formA' ? openQuiz() : undefined;
  if (warm?.label === 'Untimed warm-up') return (
    <section class="card hero" aria-labelledby="today-primary">
      <div class="eyebrow">In progress</div>
      <h2 id="today-primary" style={{ fontSize: '1.35rem' }}>Your warm-up</h2>
      <p class="muted">{warm.revealed.length} of {warm.items.length} answered, untimed. Form A, your 90-minute diagnostic, is there whenever you're ready.</p>
      <button class="btn primary block" onClick={() => startQuiz()}>Resume your warm-up · {warm.items.length - warm.revealed.length} left<IcChevron /></button>
      <button class="btn ghost block" onClick={() => navigate('start/formA')}>Or take Form A now · 90 minutes</button>
    </section>
  );
  if (firstVisit && a.kind === 'formA') return (
    <section class="card hero" aria-labelledby="today-primary">
      <div class="eyebrow">Start here</div>
      <h2 id="today-primary" style={{ fontSize: '1.35rem' }}>Warm up with 10 untimed questions</h2>
      <p class="muted">The reasoning comes after every answer. Then take Form A, your 90-minute diagnostic, whenever you're ready.</p>
      <button class="btn primary block" onClick={() => startQuiz()}>Start the warm-up<IcChevron /></button>
      <button class="btn ghost block" onClick={() => navigate('start/formA')}>Or take Form A now · 90 minutes</button>
    </section>
  );
  const map: Record<string, { eyebrow: string; title: string; cta: string; go: () => void; note?: string; second?: { label: string; go: () => void }; ctaFirst?: boolean }> = {
    resume: { eyebrow: 'In progress', title: a.kind === 'resume' ? `Resume ${a.session.title}` : '', cta: 'Resume', go: () => a.kind === 'resume' && navigate(`s/${a.session.id}`) },
    formA: { eyebrow: 'Recommended', title: 'Take Form A — your diagnostic', cta: 'Start Form A', go: () => navigate('start/formA'), note: '115 questions · 90 minutes · no breaks', second: SHORT },
    formB: { eyebrow: 'Recommended', title: 'Take Form B', cta: 'Start Form B', go: () => navigate('start/formB'), note: '115 questions · 90 minutes · fresh questions', second: SHORT },
    mixed: { eyebrow: 'Final week', title: 'Take a mixed exam', cta: 'Start mixed exam', go: () => navigate('start/mixed'), note: '115 questions · 90 minutes · blueprint-matched', second: SHORT },
    reviewExam: a.kind !== 'reviewExam' ? { eyebrow: '', title: '', cta: '', go: () => {} } : reviewCard(a.session),
    weak: { eyebrow: 'Recommended', title: a.kind === 'weak' ? `Weak-area drill · ${a.count} questions` : '', cta: 'Start drill', go: () => a.kind === 'weak' && startWeak(a.count), note: 'Tutor mode: rationale after every answer' },
    review: { eyebrow: 'Recommended', title: a.kind === 'review' ? `Spaced review · ${a.count} questions` : '', cta: 'Start review', go: startReview, note: 'Tutor mode: rationale after every answer' },
    light: { eyebrow: 'Final days', title: 'Light review', cta: Object.keys(ctx.store.state.cardSrs).length ? 'Review cards you know' : 'Skim concept cards', go: () => navigate(Object.keys(ctx.store.state.cardSrs).length ? 'cards/study' : 'cards'), second: { label: 'Exam-day notes', go: () => navigate('ref/examday') } },
    done: { eyebrow: 'Nice work', title: 'Daily target reached', cta: '', go: () => {} },
    passed: { eyebrow: 'Exam date passed', title: 'Update your exam date', cta: 'Open settings', go: () => navigate('settings') },
  };
  const m = map[a.kind];
  // Today's goal is done: a 90-minute exam can wait for a fresh day, so it becomes a quiet link, not the headline.
  if (later) return (
    <div class="section">
      <h2>Next, when you have 90 minutes</h2>
      <div class="list"><ListLink onClick={m.go} title={m.title} sub={m.note} /></div>
    </div>
  );
  return (
    <section class="card hero" aria-labelledby="today-primary">
      <div class="eyebrow">{m.eyebrow}</div>
      <h2 id="today-primary" style={{ fontSize: '1.35rem' }}>{m.title}</h2>
      {m.ctaFirst ? <>{/* the action right under the heading, one short line beneath (fits at larger text) */}
        {m.cta && <button class="btn primary block" onClick={m.go}>{m.cta}<IcChevron /></button>}
        {m.note && <p class="small muted" style={{ margin: '.5rem 0 0' }}>{m.note}</p>}
      </> : <>
        <p class="muted">{why}</p>
        {m.note && <p class="small muted">{m.note}</p>}
        {m.cta && <button class="btn primary block" onClick={m.go}>{m.cta}<IcChevron /></button>}
      </>}
      {m.second && <button class="btn ghost block" onClick={m.second.go}>{m.second.label}</button>}
    </section>
  );
}

/** Study days inside the daily card: a gain-only line and the last seven days. A missed day just starts a new run. */
function StudyDays({ now, newToday }: { now: number; newToday: boolean }) {
  const db = useDb();
  const days = studyDays(db);
  if (!days.size) return null;
  const st = streak(days, now);
  const first = [...days].sort()[0];
  const week = lastWeek(days, now);
  const span = week.filter((d) => d.date >= first).length; // days since you started, up to a week
  const studied = week.filter((d) => d.studied).length;
  const title = st.count >= 2 ? `${st.count} days in a row` : span === 1 ? 'Day 1' : studied === 0 ? 'Welcome back' : `${studied} of the last ${span} days`;
  const sub = span === 1 ? 'You started today. Nice.' : st.today ? 'You studied today. Nice.' : st.count >= 2 ? 'Any question, card or review today adds a day. A missed day just starts a new run.' : studied === 0 ? 'Any question, card or review today starts a new run.' : 'Any question, card or review today counts.';
  return (
    <div class="study-days">
      <div class="streak-head">
        <span class="flame" aria-hidden="true">{st.count >= 2 ? '🔥' : '🌱'}</span>
        <div class="grow"><div class="streak-title">{title}</div><div class="small muted">{sub}</div></div>
      </div>
      {span > 1 && <ol class={`week${span < 7 ? ' partial' : ''}`} aria-label={span < 7 ? 'The days since you started' : 'The last seven days'}>
        {week.filter((d) => span === 7 || d.date >= first).map((d) => { // first week: only the days since you started
          const long = new Date(`${d.date}T12:00`).toLocaleDateString(undefined, { weekday: 'long' });
          return (
            <li class={`${d.studied ? 'on' : ''}${d.today ? ' today' : ''}${d.today && d.studied && newToday ? ' new' : ''}${d.date < first ? ' before' : ''}`}>
              <span class="dot" aria-hidden="true">{d.studied ? '✓' : ''}</span><span class="wd" aria-hidden="true">{d.label}</span>
              <span class="sr-only">{long}{d.today ? ', today' : ''}: {d.studied ? 'studied' : d.date < first ? 'before you started' : 'no study'}</span>
            </li>
          );
        })}
      </ol>}
      {span > 1 && st.count - (st.today ? 7 : 6) > 0 && <p class="small muted week-caption">Last 7 days · {plural(st.count - (st.today ? 7 : 6), 'earlier day')} in this run</p>}{/* so the count and the dots add up */}
    </div>
  );
}

/** Today's questions toward the daily target, study days, and quick ways to practise. */
const SHOWN_KEY = 'cmpc-prep:today-shown';
/** What Today last showed in this visit, so the bar grows (and today's dot pops) only when there is something new. */
function useLastShown(answered: number, studiedToday: boolean) {
  const [prev] = useState(() => { try { return JSON.parse(sessionStorage.getItem(SHOWN_KEY) ?? 'null') as { d: string; n: number; t: boolean } | null; } catch { return null; } });
  useEffect(() => { try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify({ d: ymd(), n: answered, t: studiedToday })); } catch { /* */ } }, [answered, studiedToday]);
  const same = prev?.d === ymd();
  return { from: same ? prev!.n : 0, newToday: studiedToday && !(same && prev!.t) };
}

function DailyCard({ answered, now, reachedNote }: { answered: number; now: number; reachedNote?: string }) {
  const db = useDb();
  const s = db.settings;
  const progress = Math.min(100, Math.round((100 * answered) / Math.max(1, s.dailyTarget)));
  const reached = progress >= 100;
  const shown = useLastShown(answered, studyDays(db).has(ymd(now)));
  const grew = shown.from < answered;
  const fromPct = Math.min(progress, (100 * shown.from) / Math.max(1, s.dailyTarget));
  return (
    <div class="section">
      <h2>Today's study</h2>
      <div class={`card daily${reached ? ' reached' : ''}`}>
        {reached
          ? <div class="row between"><strong class="goal-done"><span aria-hidden="true">🎉 </span>Daily goal reached</strong><span class="muted small">{answered} of {s.dailyTarget}</span></div>
          : <div class="row between"><span>{answered} of {s.dailyTarget} questions</span><span class="muted small">{progress >= 80 ? `${s.dailyTarget - answered} to go` : progress >= 50 ? 'Halfway there' : `${progress}%`}</span></div>}
        <div style={{ marginTop: '.5rem', '--from': progress ? fromPct / progress : 0 } as any}><Meter value={progress} label="Daily target" grew={grew} /></div>
        <p class="small muted" style={{ margin: '.5rem 0 0' }}>{reached ? reachedNote ?? "That's enough for today. Anything more is optional." : 'Counts every question you answer, including spaced review.'}</p>
        <StudyDays now={now} newToday={shown.newToday} />
        {reached && <p class="small muted more-label">If you want more:</p>}
        <div class={`btn-row${reached ? '' : ' mt'}`} style={reached ? { marginTop: '.4rem' } : undefined}>
          {(() => { const q = openQuiz(); return <button class={`btn small${reached ? ' ghost' : ''}`} onClick={startQuiz}>{q ? <>Resume · <span class="keep">{q.items.length - q.revealed.length} left</span></> : 'Quick quiz · 10'}</button>; })()}
          <a class={`btn small${reached ? ' ghost' : ''}`} href="#/study">More options</a>
        </div>
      </div>
    </div>
  );
}

/** Unfinished sessions other than the one already offered above. */
/** Started reviews (kept until finished or set aside) and open sessions, other than the one already offered above. */
function inProgressOf(db: DbState, skip?: string) {
  const reviews = Object.values(db.sessions).filter((x) => x.id !== skip && x.status === 'submitted' && x.timed && !x.reviewedAt && openedMisses(x) > 0)
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));
  const open = Object.values(db.sessions)
    .filter((x) => x.status === 'active' && x.id !== skip && (x.timed ? x.startedAt : x.revealed.length > 0 || Object.keys(x.responses).length > 0))
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  return { reviews, open };
}
function InProgress({ skip }: { skip?: string }) {
  const db = useDb();
  const { reviews: allReviews, open } = inProgressOf(db, skip);
  const [more, setMore] = useState(false);
  const shown = more ? allReviews : allReviews.slice(0, 3); // the latest three; older ones one tap away
  if (!open.length && !allReviews.length) return null;
  async function discard(id: string, title: string, timed: boolean) {
    const ok = await confirmDialog({ title: `Discard ${title}?`, body: timed ? 'It will not be scored. Items you opened count as already seen.' : 'Answers you already checked stay in your progress.', ok: 'Discard', danger: true });
    if (ok) abandon(id);
  }
  return (
    <div class="section in-progress">
      <h2>In progress</h2>
      <div class="list">
        {shown.map((x, i) => (
          <div class="list-pair">
            {(() => { const st = reviewStep(x); const all = st.kind === 'finish' || st.kind === 'resumeLast'; return <>
              {st.kind === 'finish'
                ? <button class="list-item" data-first-more={i === 3 || undefined} onClick={() => { finishReview(x.id); navigate(`results/${x.id}`); }}><span class="li-main"><span class="li-title">{x.title} review</span><span class="li-sub" style={{ display: 'block' }}>{openedMisses(x)} of {plural(missedPositions(x).length, 'miss', 'misses')} read{x.submittedAt && <>{' '}<span class="keep">· {fmtShort(x.submittedAt)}</span></>}</span></span><span class="badge accent">Finish</span></button> /* finishing opens the result, where its moment plays */
                : <a class="list-item" data-first-more={i === 3 || undefined} href={`#/review/${x.id}${nextMiss(x) === undefined ? '' : `/${nextMiss(x)}`}?f=incorrect`}><span class="li-main"><span class="li-title">{x.title} review</span><span class="li-sub" style={{ display: 'block' }}>{openedMisses(x)} of {plural(missedPositions(x).length, 'miss', 'misses')} read{x.submittedAt && <>{' '}<span class="keep">· {fmtShort(x.submittedAt)}</span></>}</span></span><span class="badge accent">Resume</span></a>}
              {st.kind !== 'finish' && <button class="btn small ghost" onClick={() => { if (all) { finishReview(x.id); navigate(`results/${x.id}`); } else { markReviewed(x.id); toast(['formA', 'formB', 'mixed'].includes(x.kind) ? `Set aside. ${x.title} stays under Progress.` : 'Set aside. Its missed questions still come back in spaced review.'); } }}>{all ? 'Finish' : 'Set aside'}<span class="sr-only"> for the {x.title} review</span></button>}
            </>; })()}
          </div>
        ))}
        {allReviews.length > 3 && !more && <div class="list-pair"><button class="list-item" onClick={() => { setMore(true); requestAnimationFrame(() => document.querySelector<HTMLElement>('.in-progress [data-first-more]')?.focus()); }}><span class="li-main"><span class="li-title">Show {allReviews.length - 3} more {allReviews.length - 3 === 1 ? 'review' : 'reviews'}</span></span></button></div>}
        {open.map((x) => {
          const n = x.timed ? Object.keys(x.responses).length : x.revealed.length;
          return (
            <div class="list-pair">
              <a class="list-item" href={`#/s/${x.id}`}><span class="li-main"><span class="li-title">{x.title}</span><span class="li-sub" style={{ display: 'block' }}>{n} of {plural(x.items.length, 'question')} answered <span class="keep">· started {fmtShort(x.createdAt)}</span></span></span><span class="badge accent">Resume</span></a>
              <button class="icon-btn" onClick={() => discard(x.id, x.title, x.timed)} aria-label={`Discard ${x.title}`}><IcX /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Today() {
  const db = useDb();
  const now = useNow(60000);
  const p = plan(db, now); // refreshes after midnight and when the app returns to the foreground
  const s = db.settings;
  const light = isLight(p.phase);
  const goalMet = !light && p.answeredToday >= s.dailyTarget;
  const firstVisit = !db.attempts.length && !Object.keys(db.cardSrs).length;
  const skipId = p.primary.kind === 'resume' || p.primary.kind === 'reviewExam' ? p.primary.session.id : undefined;
  const ip = inProgressOf(db, skipId);
  const hasRight = light || (p.dueItems > 0 && p.primary.kind !== 'review') || p.dueCards > 0 || ip.reviews.length + ip.open.length > 0;
  const urgent = p.primary.kind === 'resume' || p.primary.kind === 'reviewExam'; // a running timer or a fresh review comes first
  // Only say the exam covered the goal when today's answers from that sitting alone reach it.
  const examToday = p.primary.kind === 'reviewExam' ? db.attempts.filter((a) => a.s === (p.primary as { session: { id: string } }).session.id && ymd(a.t) === ymd(now) && !a.na).length : 0;
  const reachedNote = p.primary.kind === 'resume' ? 'Your daily goal is already met.'
    : p.primary.kind === 'reviewExam' && examToday >= s.dailyTarget ? "Your exam covered today's goal." : undefined;
  const examNext = p.primary.kind === 'formA' || p.primary.kind === 'formB' || p.primary.kind === 'mixed';
  const started = db.attempts[0]?.t ?? Infinity;
  const needBackup = Date.now() - started > 2 * 86400000 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > WEEK) && (!s.backupSnoozeUntil || Date.now() > s.backupSnoozeUntil);
  const notInstalled = ctx.caps.ios && !ctx.caps.standalone;
  const inProgress = <InProgress skip={skipId} />;
  return (
    <Page title="Today" noBack wide={hasRight}>
      <div class="row between" style={{ marginBottom: '1rem' }}>
        <div class="grow">
          {p.daysLeft !== null && p.daysLeft >= 0
            ? <><div style={{ fontSize: '1.6rem', fontWeight: 750, lineHeight: 1.1 }}>{p.daysLeft === 0 ? 'Exam day' : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`}</div><div class="muted small">{p.daysLeft === 0 ? 'Good luck.' : `until your exam · ${fmtDate(s.examDate!)}`}</div></>
            : <div class="row between"><span class="muted">{p.daysLeft === null ? 'No exam date set' : `Exam date passed · ${fmtDate(s.examDate!)}`}</span><a class="btn small" href="#/settings">{p.daysLeft === null ? 'Set exam date' : 'Change date'}</a></div>}
        </div>
      </div>

      <div class={hasRight ? 'cols' : undefined}>{/* one centred column when there's nothing for a second one */}
      <div>
      {light ? <Primary a={p.primary} why={p.why} />
        : goalMet && !urgent ? <>{/* goal reached: the day's win leads; an exam can wait for a fresh day */}
          <DailyCard answered={p.answeredToday} now={now} />
          {p.primary.kind !== 'done' && <Primary a={p.primary} why={p.why} later={examNext} />}
        </>
        : <><Primary a={p.primary} why={p.why} firstVisit={firstVisit} /><DailyCard answered={p.answeredToday} now={now} reachedNote={reachedNote} /></>}

      {!hasRight && inProgress}
      </div>
      <div>
      {hasRight && inProgress}{/* on iPad, beside the recommendation rather than below the fold; phones stack it in the same place */}

      {!light && ((p.dueItems > 0 && p.primary.kind !== 'review') || p.dueCards > 0) && (
        <div class="section">
          <h2>Due reviews</h2>
          <div class="list">
            {p.dueItems > 0 && p.primary.kind !== 'review' && <button class="list-item" onClick={startReview}><span class="li-main"><span class="li-title">Spaced review</span><span class="li-sub" style={{ display: 'block' }}>Missed and uncertain questions{p.dueItems > REVIEW_MAX ? ` · ${REVIEW_MAX} per session` : ''}</span></span><span class="badge accent">{p.dueItems} due</span><IcChevron class="chev" /></button>}
            {p.dueCards > 0 && <a class="list-item" href="#/cards/study"><span class="li-main"><span class="li-title">Concept cards</span><span class="li-sub" style={{ display: 'block' }}>{p.dueCards < 12 ? `${p.dueCards} due, then new cards` : 'Cards to recall again'}</span></span><span class="badge accent">{p.dueCards} due</span><IcChevron class="chev" /></a>}
          </div>
        </div>
      )}

      {light && (
        <div class="section">
          <h2>Optional</h2>
          <div class="list">
            <ListLink onClick={startQuiz} title={openQuiz() ? 'Resume quick quiz' : 'Quick quiz'} sub={(() => { const q = openQuiz(); return q ? `${q.revealed.length} of ${q.items.length} answered` : '10 questions'; })()} />
            {p.dueItems > 0 && <ListLink onClick={startReview} title="Spaced review" sub="A short set of questions you missed before" />}
          </div>
        </div>
      )}
      </div>
      </div>

      {needBackup && (
        <div class="banner warn mt" role="note">
          <IcAlert />
          <div class="grow">
            <strong>Back up your progress.</strong> <span class="small">{s.lastBackupAt ? "It's been over a week." : "You haven't made a backup yet."} {ctx.caps.standalone ? 'A backup file protects you if the app is removed or the device is lost.' : "Safari can erase data for sites that aren't on your Home Screen after about a week without a visit."}</span>
            <div class="btn-row" style={{ marginTop: '.6rem' }}>
              <a class="btn small" href="#/backup">Go to backup</a>
              <button class="btn small ghost" onClick={() => ctx.store.updateSettings({ backupSnoozeUntil: Date.now() + WEEK })}>Remind me in a week</button>
            </div>
          </div>
        </div>
      )}
      {notInstalled && !needBackup && !light && !s.installDismissed && (
        <div class="banner info mt" role="note"><IcPhone /><div class="small grow">
          {db.attempts.length > 0
            ? <><strong>Moving to the Home Screen app?</strong> It keeps its own data and starts empty. Back up here first, then restore the file there.</>
            : <><strong>Add to Home Screen before you start.</strong> The Home Screen app works offline, full-screen, and keeps its own data.</>}
          <div class="btn-row" style={{ marginTop: '.5rem' }}>{db.attempts.length > 0 && <a class="btn small" href="#/backup">Go to backup</a>}<a class="btn small" href="#/onboarding/install">Show me how</a><button class="btn small ghost" onClick={() => ctx.store.updateSettings({ installDismissed: true })}>Don't show again</button></div></div></div>
      )}
      {ctx.store.kv.kind !== 'indexeddb' && (
        <div class="banner warn mt" role="alert"><IcInfo /><div class="small">{ctx.store.kv.kind === 'memory' ? 'Storage is unavailable (private browsing?). Progress will be lost when you close this tab — back up often.' : 'Using fallback storage. Back up regularly.'}</div></div>
      )}
    </Page>
  );
}
