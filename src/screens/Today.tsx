import { ctx, useDb, useNow } from '../ctx';
import { navigate } from '../router';
import { abandon, createSession, markReviewed, missedPositions, nextMiss, openedMisses } from '../lib/actions';
import { REVIEW_MAX, buildDrill, buildQuiz, buildReview } from '../lib/assemble';
import { fmtDate, fmtShort, plural, ymd } from '../lib/dates';
import { isLight, plan, type Action } from '../lib/plan';
import { dueIds } from '../lib/srs';
import { ListLink, Meter, Page } from '../ui/bits';
import { alertDialog, confirmDialog } from '../ui/dialog';
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
export const openQuiz = () => Object.values(ctx.store.state.sessions).filter((x) => x.kind === 'quiz' && x.status === 'active' && x.revealed.length > 0).sort((a, b) => b.createdAt - a.createdAt)[0];
export function startQuiz() {
  const open = openQuiz();
  if (open) return navigate(`s/${open.id}`);
  const s = buildQuiz(ctx.bank, ctx.store.state);
  createSession(s); navigate(`s/${s.id}`);
}

function Primary({ a, why }: { a: Action; why: string }) {
  const map: Record<string, { eyebrow: string; title: string; cta: string; go: () => void; note?: string; second?: { label: string; go: () => void } }> = {
    resume: { eyebrow: 'In progress', title: a.kind === 'resume' ? `Resume ${a.session.title}` : '', cta: 'Resume', go: () => a.kind === 'resume' && navigate(`s/${a.session.id}`) },
    formA: { eyebrow: 'Recommended', title: 'Take Form A — your diagnostic', cta: 'Start Form A', go: () => navigate('start/formA'), note: '115 questions · 90 minutes · no breaks' },
    formB: { eyebrow: 'Recommended', title: 'Take Form B', cta: 'Start Form B', go: () => navigate('start/formB'), note: '115 questions · 90 minutes · fresh questions' },
    mixed: { eyebrow: 'Final week', title: 'Take a mixed exam', cta: 'Start mixed exam', go: () => navigate('start/mixed'), note: '115 questions · 90 minutes · blueprint-matched' },
    reviewExam: { eyebrow: 'Recommended', title: a.kind === 'reviewExam' ? `Review your ${a.session.title} misses` : '', cta: a.kind !== 'reviewExam' ? '' : openedMisses(a.session) ? `Continue review · ${openedMisses(a.session)} of ${missedPositions(a.session).length}` : `Review ${plural(missedPositions(a.session).length, 'miss', 'misses')}`, second: a.kind === 'reviewExam' ? { label: openedMisses(a.session) ? "I'm done reviewing" : 'Skip this review', go: () => markReviewed(a.session.id) } : undefined, go: () => { if (a.kind !== 'reviewExam') return; const n = openedMisses(a.session) ? nextMiss(a.session) : undefined; navigate(`review/${a.session.id}${n === undefined ? '' : `/${n}`}?f=incorrect`); } },
    weak: { eyebrow: 'Recommended', title: a.kind === 'weak' ? `Weak-area drill · ${a.count} questions` : '', cta: 'Start drill', go: () => a.kind === 'weak' && startWeak(a.count), note: 'Tutor mode: rationale after every answer' },
    review: { eyebrow: 'Recommended', title: a.kind === 'review' ? `Spaced review · ${a.count} questions` : '', cta: 'Start review', go: startReview, note: 'Tutor mode: rationale after every answer' },
    light: { eyebrow: 'Final days', title: 'Light review', cta: Object.keys(ctx.store.state.cardSrs).length ? 'Review cards you know' : 'Skim concept cards', go: () => navigate(Object.keys(ctx.store.state.cardSrs).length ? 'cards/study' : 'cards'), second: { label: 'Exam-day notes', go: () => navigate('ref/examday') } },
    done: { eyebrow: 'Nice work', title: 'Daily target reached', cta: 'Quick quiz (10 questions)', go: startQuiz },
    passed: { eyebrow: 'Exam date passed', title: 'Update your exam date', cta: 'Open settings', go: () => navigate('settings') },
  };
  const m = map[a.kind];
  return (
    <section class="card hero" aria-labelledby="today-primary">
      <div class="eyebrow">{m.eyebrow}</div>
      <h2 id="today-primary" style={{ fontSize: '1.35rem' }}>{m.title}</h2>
      <p class="muted">{why}</p>
      {m.note && <p class="small muted">{m.note}</p>}
      <button class="btn primary block" onClick={m.go}>{m.cta}<IcChevron /></button>
      {m.second && <button class="btn ghost block" onClick={m.second.go}>{m.second.label}</button>}
    </section>
  );
}

/** Unfinished sessions other than the one already offered above. */
function InProgress({ skip }: { skip?: string }) {
  const db = useDb();
  const reviews = Object.values(db.sessions).filter((x) => x.id !== skip && x.status === 'submitted' && ['formA', 'formB', 'mixed'].includes(x.kind) && !x.reviewedAt && openedMisses(x) > 0 && Date.now() - (x.submittedAt ?? 0) < WEEK);
  const open = Object.values(db.sessions)
    .filter((x) => x.status === 'active' && x.id !== skip && (x.timed ? x.startedAt : x.revealed.length > 0 || Object.keys(x.responses).length > 0))
    .sort((a, b) => b.createdAt - a.createdAt).slice(0, 3);
  if (!open.length && !reviews.length) return null;
  async function discard(id: string, title: string, timed: boolean) {
    const ok = await confirmDialog({ title: `Discard ${title}?`, body: timed ? 'It will not be scored. Items you opened count as already seen.' : 'Answers you already checked stay in your progress.', ok: 'Discard', danger: true });
    if (ok) abandon(id);
  }
  return (
    <div class="section">
      <h2>In progress</h2>
      <div class="list">
        {reviews.map((x) => (
          <div class="list-pair">
            <a class="list-item" href={`#/review/${x.id}${nextMiss(x) === undefined ? '' : `/${nextMiss(x)}`}?f=incorrect`}><span class="li-main"><span class="li-title">{x.title} review</span><span class="li-sub" style={{ display: 'block' }}>{openedMisses(x)} of {missedPositions(x).length} misses opened</span></span><span class="badge accent">Resume</span></a>
            <button class="icon-btn" onClick={() => markReviewed(x.id)} aria-label={`Mark ${x.title} review done`}><IcX /></button>
          </div>
        ))}
        {open.map((x) => {
          const n = x.timed ? Object.keys(x.responses).length : x.revealed.length;
          return (
            <div class="list-pair">
              <a class="list-item" href={`#/s/${x.id}`}><span class="li-main"><span class="li-title">{x.title}</span><span class="li-sub" style={{ display: 'block' }}>{n} of {plural(x.items.length, 'question')} answered · started {fmtShort(x.createdAt)}</span></span><span class="badge accent">Resume</span></a>
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
  const p = plan(db, useNow(60000)); // refreshes after midnight and when the app returns to the foreground
  const s = db.settings;
  const light = isLight(p.phase);
  const progress = Math.min(100, Math.round((100 * p.answeredToday) / Math.max(1, s.dailyTarget)));
  const started = db.attempts[0]?.t ?? Infinity;
  const needBackup = Date.now() - started > 2 * 86400000 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > WEEK) && (!s.backupSnoozeUntil || Date.now() > s.backupSnoozeUntil);
  const notInstalled = ctx.caps.ios && !ctx.caps.standalone;
  return (
    <Page title="Today" noBack wide>
      <div class="row between" style={{ marginBottom: '1rem' }}>
        <div class="grow">
          {p.daysLeft !== null && p.daysLeft >= 0
            ? <><div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{p.daysLeft === 0 ? 'Exam day' : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`}</div><div class="muted small">{p.daysLeft === 0 ? 'Good luck.' : `until your exam · ${fmtDate(s.examDate!)}`}</div></>
            : <div class="row between"><span class="muted">{p.daysLeft === null ? 'No exam date set' : `Exam date passed · ${fmtDate(s.examDate!)}`}</span><a class="btn small" href="#/settings">{p.daysLeft === null ? 'Set exam date' : 'Change date'}</a></div>}
        </div>
      </div>

      <div class="cols">
      <div>
      <Primary a={p.primary} why={p.why} />

      <InProgress skip={p.primary.kind === 'resume' || p.primary.kind === 'reviewExam' ? p.primary.session.id : undefined} />
      </div>
      <div>

      {!light && ((p.dueItems > 0 && p.primary.kind !== 'review') || p.dueCards > 0) && (
        <div class="section">
          <h2>Due reviews</h2>
          <div class="list">
            {p.dueItems > 0 && p.primary.kind !== 'review' && <button class="list-item" onClick={startReview}><span class="li-main"><span class="li-title">Spaced review</span><span class="li-sub" style={{ display: 'block' }}>Missed and uncertain questions{p.dueItems > REVIEW_MAX ? `, ${REVIEW_MAX} at a time` : ''}</span></span><span class="badge accent">{p.dueItems} due</span><IcChevron class="chev" /></button>}
            {p.dueCards > 0 && <a class="list-item" href="#/cards/study"><span class="li-main"><span class="li-title">Concept cards</span><span class="li-sub" style={{ display: 'block' }}>{p.dueCards < 12 ? `${p.dueCards} due, then new cards` : 'Cards to recall again'}</span></span><span class="badge accent">{p.dueCards} due</span><IcChevron class="chev" /></a>}
          </div>
        </div>
      )}

      <div class="section">
        <h2>{light ? 'Optional' : "Today's study"}</h2>
        {light ? (
          <div class="list">
            <ListLink onClick={startQuiz} title={openQuiz() ? 'Resume quick quiz' : 'Quick quiz'} sub="10 questions" />
            {p.dueItems > 0 && <ListLink onClick={startReview} title="Spaced review" sub="A short set of questions you missed before" />}
          </div>
        ) : (
        <div class="card">
          <div class="row between"><span>{p.answeredToday} of {s.dailyTarget} questions</span><span class="muted small">{progress}%</span></div>
          <div class="mt" style={{ marginTop: '.5rem' }}><Meter value={progress} label="Daily target" /></div>
          <p class="small muted" style={{ margin: '.5rem 0 0' }}>Counts every question you answer, including spaced review.</p>
          <div class="btn-row mt">
            {openQuiz() ? <button class="btn small" onClick={() => startWeak(10)}>Short drill · 10</button> : <button class="btn small" onClick={startQuiz}>Quick quiz · 10</button>}
            <a class="btn small" href="#/study">More options</a>
          </div>
        </div>
        )}
      </div>
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
