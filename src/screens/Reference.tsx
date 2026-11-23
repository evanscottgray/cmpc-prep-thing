import { useState } from 'preact/hooks';
import { APP_VERSION, ctx } from '../ctx';
import { Page, Seg, Verify } from '../ui/bits';

export const ABOUT_TEXT = 'Unofficial study tool. Not affiliated with or endorsed by AASP. CMPC® is a registered trademark of the Association for Applied Sport Psychology. All questions are original practice items, not actual exam questions. Scores are estimates.';

export function ExamFacts() {
  return (
    <Page title="Exam facts" backTo="more">
      <Verify />
      <div class="card stack">
        <h2>Format</h2>
        <ul>
          <li>115 multiple-choice items in 90 minutes, in one sitting, with no breaks.</li>
          <li>Delivered by Meazure Learning at test centers or by live online proctoring.</li>
          <li>About 47 seconds per item.</li>
          <li>AASP describes items only as multiple choice. This app assumes four options with a single best answer. Candidates report that the exam is applied and scenario-based rather than definitional.</li>
          <li>The content outline comes from a 2023 job analysis aimed at a newly certified consultant.</li>
        </ul>
        <h2>Scoring</h2>
        <ul>
          <li>15 items are unscored trial items that candidates can't identify. The score comes from the other 100.</li>
          <li>The raw score (0–100) converts linearly to a 200–800 scale; 550 passes.</li>
          <li>AASP doesn't publish the raw passing score. This app uses a configurable target (default 70) for its estimates.</li>
        </ul>
        <h2>Results</h2>
        <ul>
          <li>You see a tentative pass/fail right away. The official report follows within about three weeks.</li>
          <li>Only failing candidates see percent correct by domain.</li>
          <li>Retakes require a 90-day wait.</li>
        </ul>
      </div>
    </Page>
  );
}

export function BlueprintRef() {
  const bp = ctx.bank.blueprint;
  const [view, setView] = useState<'weights' | 'grid'>('weights');
  return (
    <Page title="Blueprint" backTo="more">
      <Verify />
      <Seg name="bpv" label="View" value={view} onChange={setView} options={[{ v: 'weights', label: 'Weights' }, { v: 'grid', label: '100-item grid' }]} />
      {view === 'weights' ? (
        <>
          <div class="section" style={{ marginTop: '1rem' }}><h2>Domains (scored items per 100)</h2>
            <div class="list">{bp.domains.map((d) => <div class="list-item" style={{ cursor: 'default' }}><span class="li-main"><span class="li-title">{d.id}. {d.name}</span></span><span class="badge accent">{d.weight}</span></div>)}</div>
          </div>
          <div class="section"><h2>Knowledge groups (scored items per 100)</h2>
            <div class="list">{bp.kgs.map((k) => <div class="list-item" style={{ cursor: 'default' }}><span class="li-main"><span class="li-title">{k.id}. {k.name}</span></span><span class="badge accent">{k.weight}</span></div>)}</div>
          </div>
        </>
      ) : (
        <div class="card mt">
          <p class="small muted">Derived from AASP's August 2023 test specifications, with each "Other" cluster resolved as one item per listed group. Every scored form in this app matches this grid exactly.</p>
          <div class="table-wrap">
            <table class="grid">
              <caption class="sr-only">Scored items per knowledge group (rows) and domain (columns)</caption>
              <thead><tr><th scope="col">KG</th>{bp.domains.map((d) => <th scope="col">{d.id}</th>)}<th scope="col">Total</th></tr></thead>
              <tbody>
                {bp.kgs.map((k) => <tr><th scope="row">{k.id}</th>{bp.domains.map((d) => <td>{bp.grid[k.id][d.id]}</td>)}<td><strong>{k.weight}</strong></td></tr>)}
                <tr><th scope="row">Total</th>{bp.domains.map((d) => <td><strong>{d.weight}</strong></td>)}<td><strong>100</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Page>
  );
}

export function ExamDay() {
  return (
    <Page title="Exam-day notes" backTo="more">
      <Verify />
      <div class="card">
        <ul class="stack" style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li><strong>No breaks.</strong> The exam is one 90-minute sitting. Eat, hydrate sensibly, and use the restroom beforehand.</li>
          <li><strong>Take Meazure Learning's exam-interface tutorial beforehand</strong> so the navigation, flagging, and review tools are familiar on the day.</li>
          <li><strong>Testing online?</strong> Check your equipment, browser, webcam, microphone, and internet connection early — not on exam morning — and prepare a quiet, clear room.</li>
          <li><strong>Bring ID that matches your registration</strong> exactly (name as registered).</li>
          <li><strong>Pace:</strong> about 47 seconds per item. Answer every item — unanswered items earn nothing. Flag and return rather than stalling.</li>
          <li>The last day or two: light review only. Sleep is part of preparation.</li>
        </ul>
      </div>
    </Page>
  );
}

export function Sources() {
  const used = Object.entries(ctx.bank.refs).sort((a, b) => a[1].c.localeCompare(b[1].c));
  return (
    <Page title="Sources" backTo="more">
      <p class="small muted">Every item and card cites one or two of these. No page numbers or quotations are given; all wording in the app is original. Policy documents (AASP Ethics Code, SafeSport Code, MAAPP) change — check the current versions.</p>
      <ol class="refs" style={{ fontSize: '.92rem', color: 'var(--text)', paddingLeft: '1.2rem' }}>{used.map(([id, r]) => <li key={id} style={{ marginBottom: '.5rem' }}>{r.c}</li>)}</ol>
    </Page>
  );
}

export function About() {
  return (
    <Page title="About" backTo="more">
      <div class="card hero">
        <img src="./icons/icon-192.png" alt="" class="logo" width="72" height="72" />
        <h2 class="mt">CMPC Prep</h2>
        <p><strong>{ABOUT_TEXT}</strong></p>
        <p class="small muted" style={{ marginBottom: 0 }}>Version {APP_VERSION} · question bank {ctx.bank.version} · {ctx.bank.items.length} items · {ctx.bank.cards.length} concept cards</p>
      </div>
      <div class="card">
        <h2>Privacy</h2>
        <p style={{ marginBottom: 0 }}>Everything stays on this device. The app makes no network requests after it loads: no accounts, analytics, ads, or AI calls. Backups are files you control.</p>
      </div>
    </Page>
  );
}
