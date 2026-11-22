import { useEffect, useState } from 'preact/hooks';
import { ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { addDays, ymd } from '../lib/dates';
import { requestPersistence } from '../lib/persist';
import { Page, Stepper } from '../ui/bits';
import { IcAlert, IcShare } from '../ui/icons';
import { ABOUT_TEXT } from './Reference';

export function Onboarding({ step: initial }: { step: number }) {
  const db = useDb();
  const [step, setStep] = useState(Math.min(3, Math.max(1, initial || 1)));
  const [date, setDate] = useState(db.settings.examDate ?? addDays(ymd(), 21));
  const [target, setTarget] = useState(db.settings.dailyTarget);
  useEffect(() => { document.getElementById('onb-h')?.focus(); window.scrollTo(0, 0); }, [step]);
  const caps = ctx.caps;
  function finish() {
    ctx.store.updateSettings({ examDate: date || null, dailyTarget: target, onboarded: true });
    requestPersistence();
    navigate('today', true);
  }
  return (
    <Page title="Welcome" noBack tabs={false}>
      <div class="onb">
        <div class="steps-dots" aria-label={`Step ${step} of 3`}>{[1, 2, 3].map((i) => <span aria-current={i === step ? 'step' : undefined} />)}</div>
        {step === 1 && (
          <section class="stack">
            <img src="./icons/icon-192.png" alt="" class="logo" width="72" height="72" />
            <h2 id="onb-h" tabIndex={-1} style={{ fontSize: '1.5rem' }}>Prepare for the CMPC® exam</h2>
            <p>CMPC Prep is a focused study and exam-simulation app:</p>
            <ul>
              <li><strong>Two full practice forms</strong> (115 items, 90 minutes) built to the published exam blueprint, plus mixed exams.</li>
              <li><strong>Rationales for every option</strong>, so each item teaches.</li>
              <li><strong>Drills, spaced review and concept cards</strong> that focus on your weakest, most heavily weighted areas.</li>
              <li>Works offline. Your progress stays on this device.</li>
            </ul>
            <p class="small muted">{ABOUT_TEXT}</p>
            <button class="btn primary block" onClick={() => setStep(2)}>Continue</button>
          </section>
        )}
        {step === 2 && (
          <section>
            <h2 id="onb-h" tabIndex={-1} style={{ fontSize: '1.5rem' }}>When is your exam?</h2>
            <p class="muted">The Today screen paces your plan to this date: Form A early as a diagnostic, Form B later, a mixed exam in the final week, and light review in the last day or two.</p>
            <label class="field">
              <span class="label">Exam date</span>
              <input class="input" type="date" value={date} min={ymd()} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
              <span class="hint">You can change it any time in Settings.</span>
            </label>
            <div class="field">
              <span class="label">Daily study target</span>
              <Stepper label="daily study target" value={target} min={10} max={150} step={10} onChange={setTarget} suffix=" items" />
              <span class="hint">About 40 items a day is a solid pace for a few weeks out.</span>
            </div>
            <div class="btn-row"><button class="btn" onClick={() => setStep(1)}>Back</button><button class="btn primary" onClick={() => setStep(3)}>Continue</button></div>
          </section>
        )}
        {step === 3 && (
          <section>
            <h2 id="onb-h" tabIndex={-1} style={{ fontSize: '1.5rem' }}>Add it to your Home Screen</h2>
            <p>Installed, the app opens full-screen, works offline, and Safari is far less likely to clear your data.</p>
            <ol class="howto">
              <li>In Safari, tap <strong>Share</strong> <IcShare class="status-ic" title="Share icon" /> (bottom bar on iPhone, top bar on iPad).</li>
              <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong>, then open CMPC Prep from your Home Screen.</li>
            </ol>
            {caps.standalone && <p class="badge ok">You're running the installed app.</p>}
            {!caps.secure && <p class="small muted">You're on a plain-HTTP address (like the LAN preview). Offline mode needs HTTPS; everything else works here.</p>}
            <div class="banner warn mt" role="note"><IcAlert /><div class="small">
              <strong>Protect your progress.</strong> Safari can delete data for websites that aren't on your Home Screen after about a week without a visit. Each web address also keeps separate data. Back up weekly from More → Backup and restore — the app will remind you.
            </div></div>
            <div class="btn-row mt"><button class="btn" onClick={() => setStep(2)}>Back</button><button class="btn primary" onClick={finish}>{db.settings.onboarded ? 'Done' : 'Start studying'}</button></div>
          </section>
        )}
      </div>
    </Page>
  );
}
