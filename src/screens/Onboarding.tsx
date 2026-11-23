import { useEffect, useState } from 'preact/hooks';
import { ctx, useDb } from '../ctx';
import { back, navigate } from '../router';
import { ymd } from '../lib/dates';
import { requestPersistence } from '../lib/persist';
import { Page, Stepper } from '../ui/bits';
import { IcAlert, IcShare } from '../ui/icons';
import { ABOUT_TEXT } from './Reference';

type Step = 'welcome' | 'install' | 'date';
/** Install comes before the date: on iPhone and iPad the Home Screen app keeps its own data, so anything entered first stays behind in Safari. */
export function Onboarding({ step: initial }: { step?: string }) {
  const db = useDb();
  const steps: Step[] = ctx.caps.standalone ? ['welcome', 'date'] : ['welcome', 'install', 'date'];
  const [step, setStep] = useState<Step>(steps.includes(initial as Step) ? (initial as Step) : 'welcome');
  const at = steps.indexOf(step);
  const go = (d: number) => setStep(steps[at + d]);
  const [date, setDate] = useState(db.settings.examDate ?? '');
  const [target, setTarget] = useState(db.settings.dailyTarget);
  useEffect(() => { document.getElementById('onb-h')?.focus(); window.scrollTo(0, 0); }, [step]);
  const caps = ctx.caps;
  function finish() {
    const again = db.settings.onboarded;
    ctx.store.updateSettings({ examDate: date || null, dailyTarget: target, onboarded: true });
    requestPersistence();
    if (again) back('more'); else navigate('today', true);
  }
  return (
    <Page title="Welcome" noBack={!db.settings.onboarded} backTo="more" tabs={false}>
      <div class="onb">
        <p class="sr-only">Step {at + 1} of {steps.length}</p>
        <div class="steps-dots" aria-hidden="true">{steps.map((x) => <span aria-current={x === step ? 'step' : undefined} />)}</div>
        {step === 'welcome' && (
          <section class="stack">
            <img src="./icons/icon-192.png" alt="" class="logo" width="72" height="72" />
            <h2 id="onb-h" tabIndex={-1} style={{ fontSize: '1.5rem' }}>Prepare for the CMPC® exam</h2>
            <p>CMPC Prep is a focused study and exam-simulation app:</p>
            <ul>
              <li><strong>Two full practice forms</strong> (115 questions, 90 minutes) built to the published exam blueprint, plus mixed exams.</li>
              <li><strong>Rationales for every option</strong>, so each question teaches.</li>
              <li><strong>Drills, spaced review and concept cards</strong> that focus on your weakest, most heavily weighted areas.</li>
              <li>Works offline. Your progress stays on this device.</li>
            </ul>
            <p class="small muted">{ABOUT_TEXT}</p>
            <button class="btn primary block" onClick={() => go(1)}>Continue</button>
            <p class="center small"><a href="#/backup">Restore from a backup instead</a></p>
          </section>
        )}
        {step === 'date' && (
          <section>
            <h2 id="onb-h" tabIndex={-1} style={{ fontSize: '1.5rem' }}>When is your exam?</h2>
            <p class="muted">The Today screen paces your plan to this date: Form A early as a diagnostic, Form B later, a mixed exam in the final week, and light review in the last day or two.</p>
            <label class="field">
              <span class="label">Exam date</span>
              <input class="input" type="date" value={date} min={ymd()} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
              <span class="hint">No date yet? Leave it blank and set it later in Settings.</span>
            </label>
            <div class="field">
              <span class="label">Daily study target</span>
              <Stepper label="daily study target" value={target} min={10} max={150} step={10} onChange={setTarget} suffix=" questions" />
              <span class="hint">About 40 questions a day is a solid pace for a few weeks out.</span>
            </div>
            <div class="btn-row"><button class="btn" onClick={() => go(-1)}>Back</button><button class="btn primary" onClick={finish}>{db.settings.onboarded ? 'Done' : 'Start studying'}</button></div>
          </section>
        )}
        {step === 'install' && (
          <section>
            <h2 id="onb-h" tabIndex={-1} style={{ fontSize: '1.5rem' }}>Add it to your Home Screen</h2>
            <p><strong>Do this before you start.</strong> {caps.ios ? 'The Home Screen app keeps its own data, so progress made here in Safari does not move over by itself.' : 'An installed app can keep its data separate from the browser.'} Installed, it opens full-screen, works offline, and is far less likely to lose your data.</p>
            <ol class="howto">
              <li>In Safari, tap <strong>Share</strong> <IcShare class="status-ic" title="Share icon" /> (bottom bar on iPhone, top bar on iPad). If you don't see it, tap <strong>•••</strong> first.</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>, then open CMPC Prep from your Home Screen and set it up there.</li>
            </ol>
            {!caps.secure && <p class="small muted">You're on a plain-HTTP address (a home-network preview). Offline mode needs HTTPS; everything else works here.</p>}
            {db.attempts.length > 0 && (
              <div class="banner warn mt" role="note"><IcAlert /><div class="small"><strong>You already have progress here.</strong> <a href="#/backup">Back it up</a> first, then restore the file in the Home Screen app.</div></div>
            )}
            <p class="small muted mt">Staying in Safari works too, but Safari can delete data for websites after about a week without a visit. Back up weekly; the app will remind you.</p>
            <div class="btn-row mt"><button class="btn" onClick={() => go(-1)}>Back</button><button class="btn primary" onClick={() => { ctx.store.updateSettings({ installDismissed: true }); go(1); }}>Continue in {caps.ios ? 'Safari' : 'the browser'}</button></div>
          </section>
        )}
      </div>
    </Page>
  );
}
