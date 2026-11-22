import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { createSession } from '../lib/actions';
import { buildDrill, buildQuiz, buildReview } from '../lib/assemble';
import { fmtDate, ymd } from '../lib/dates';
import { plan, type Action } from '../lib/plan';
import { dueIds } from '../lib/srs';
import { Meter, Page } from '../ui/bits';
import { alertDialog } from '../ui/dialog';
import { IcAlert, IcChevron, IcInfo, IcPhone } from '../ui/icons';

const WEEK = 7 * 86400000;

export function startWeak(count: number) {
  const s = buildDrill(ctx.bank, ctx.store.state, { type: 'weak' }, count, false, Date.now(), Date.now(), 'drill', 'Weak-area drill');
  if (!s) return alertDialog({ title: 'Nothing to drill yet', body: 'No available items match.' });
  createSession(s); navigate(`s/${s.id}`);
}
export function startReview() {
  const s = buildReview(ctx.bank, ctx.store.state, dueIds(ctx.store.state.srs, ymd()));
  if (!s) return alertDialog({ title: 'No reviews due', body: 'Missed and uncertain items come back here on a schedule that fits the time left before your exam.' });
  createSession(s); navigate(`s/${s.id}`);
}
export function startQuiz() {
  const s = buildQuiz(ctx.bank, ctx.store.state);
  createSession(s); navigate(`s/${s.id}`);
}

function Primary({ a, why }: { a: Action; why: string }) {
  const map: Record<string, { eyebrow: string; title: string; cta: string; go: () => void; note?: string }> = {
    resume: { eyebrow: 'In progress', title: a.kind === 'resume' ? `Resume ${a.session.title}` : '', cta: 'Resume exam', go: () => a.kind === 'resume' && navigate(`s/${a.session.id}`) },
    setDate: { eyebrow: 'Get started', title: 'Set your exam date', cta: 'Set exam date', go: () => navigate('settings') },
    formA: { eyebrow: 'Recommended', title: 'Take Form A — your diagnostic', cta: 'Start Form A', go: () => navigate('start/formA'), note: '115 items · 90 minutes · no breaks' },
    formB: { eyebrow: 'Recommended', title: 'Take Form B', cta: 'Start Form B', go: () => navigate('start/formB'), note: '115 items · 90 minutes · fresh items' },
    mixed: { eyebrow: 'Final week', title: 'Take a mixed exam', cta: 'Start mixed exam', go: () => navigate('start/mixed'), note: '115 items · 90 minutes · blueprint-matched' },
    reviewExam: { eyebrow: 'Recommended', title: a.kind === 'reviewExam' ? `Review your ${a.session.title} misses` : '', cta: 'Review misses', go: () => a.kind === 'reviewExam' && navigate(`review/${a.session.id}?f=incorrect`) },
    weak: { eyebrow: 'Recommended', title: a.kind === 'weak' ? `Weak-area drill · ${a.count} items` : '', cta: 'Start drill', go: () => a.kind === 'weak' && startWeak(a.count), note: 'Tutor mode: rationale after every answer' },
    light: { eyebrow: 'Light review', title: 'Concept cards and a short quiz', cta: 'Review concept cards', go: () => navigate('cards/study'), note: 'Keep it light. Rest is part of preparation.' },
    done: { eyebrow: 'Nice work', title: 'Daily target reached', cta: 'Quick quiz (10 items)', go: startQuiz },
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
    </section>
  );
}

export function Today() {
  const db = useDb();
  const p = plan(db);
  const s = db.settings;
  const progress = Math.min(100, Math.round((100 * p.answeredToday) / Math.max(1, s.dailyTarget)));
  const needBackup = db.attempts.length > 0 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > WEEK) && (!s.backupSnoozeUntil || Date.now() > s.backupSnoozeUntil);
  const notInstalled = ctx.caps.ios && !ctx.caps.standalone;
  return (
    <Page title="Today" noBack>
      <div class="row between" style={{ marginBottom: '1rem' }}>
        <div>
          {p.daysLeft !== null && p.daysLeft >= 0
            ? <><div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{p.daysLeft === 0 ? 'Exam day' : `${p.daysLeft} day${p.daysLeft === 1 ? '' : 's'}`}</div><div class="muted small">{p.daysLeft === 0 ? 'Good luck.' : `until your exam · ${fmtDate(s.examDate!)}`}</div></>
            : <div class="muted">No exam date set</div>}
        </div>
      </div>

      <Primary a={p.primary} why={p.why} />

      {(p.dueItems > 0 || p.dueCards > 0) && (
        <div class="section">
          <h2>Due reviews</h2>
          <div class="list">
            {p.dueItems > 0 && <button class="list-item" onClick={startReview}><span class="li-main"><span class="li-title">Spaced review</span><span class="li-sub" style={{ display: 'block' }}>{p.dueItems} missed or uncertain item{p.dueItems === 1 ? '' : 's'} due</span></span><span class="badge accent">{p.dueItems}</span><IcChevron class="chev" /></button>}
            {p.dueCards > 0 && <a class="list-item" href="#/cards/study"><span class="li-main"><span class="li-title">Concept cards</span><span class="li-sub" style={{ display: 'block' }}>{p.dueCards} card{p.dueCards === 1 ? '' : 's'} due</span></span><span class="badge accent">{p.dueCards}</span><IcChevron class="chev" /></a>}
          </div>
        </div>
      )}

      <div class="section">
        <h2>Today's study</h2>
        <div class="card">
          <div class="row between"><span>{p.answeredToday} of {s.dailyTarget} items</span><span class="muted small">{progress}%</span></div>
          <div class="mt" style={{ marginTop: '.5rem' }}><Meter value={progress} label="Daily target" /></div>
          <div class="btn-row mt">
            <button class="btn small" onClick={startQuiz}>Quick quiz · 10</button>
            <a class="btn small" href="#/study">More study options</a>
          </div>
        </div>
      </div>

      {needBackup && (
        <div class="banner warn mt" role="note">
          <IcAlert />
          <div class="grow">
            <strong>Back up your progress.</strong> <span class="small">{s.lastBackupAt ? "It's been over a week." : "You haven't made a backup yet."} Safari can erase data for sites that aren't on your Home Screen after about a week without a visit.</span>
            <div class="btn-row" style={{ marginTop: '.6rem' }}>
              <a class="btn small primary" href="#/backup">Back up now</a>
              <button class="btn small" onClick={() => ctx.store.updateSettings({ backupSnoozeUntil: Date.now() + 2 * 86400000 })}>Remind me later</button>
            </div>
          </div>
        </div>
      )}
      {notInstalled && (
        <div class="banner info mt" role="note"><IcPhone /><div class="small"><strong>Add to Home Screen</strong> for full-screen use, offline access, and safer storage. In Safari: Share → Add to Home Screen. <a href="#/onboarding/3">How</a></div></div>
      )}
      {ctx.store.kv.kind !== 'indexeddb' && (
        <div class="banner warn mt" role="alert"><IcInfo /><div class="small">{ctx.store.kv.kind === 'memory' ? 'Storage is unavailable (private browsing?). Progress will be lost when you close this tab — back up often.' : 'Using fallback storage. Back up regularly.'}</div></div>
      )}
    </Page>
  );
}
