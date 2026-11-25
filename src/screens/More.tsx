import { useRef, useState } from 'preact/hooks';
import type { TextSize, Theme } from '../types';
import { APP_VERSION, ctx, useDb } from '../ctx';
import { navigate } from '../router';
import { backupFilename, makeBackup, parseBackup, summarize, type BackupFile } from '../lib/backup';
import { fmtDate, plural, ymd } from '../lib/dates';
import { copyText, shareOrDownload } from '../lib/share';
import { emptyState } from '../lib/store';
import { swStatus } from '../lib/sw-register';
import { ListLink, Page, Seg, Stepper } from '../ui/bits';
import { Modal, alertDialog, confirmDialog, toast } from '../ui/dialog';
import { IcAlert, IcCheck, IcDownload, IcShare, IcX } from '../ui/icons';

export function More() {
  const db = useDb();
  return (
    <Page title="More" noBack wide>
      <div class="cols">
      <div>
      <div class="list">
        <ListLink href="#/settings" title="Settings" sub="Exam date, passing target, mode, text size, theme, celebrations" />
        <ListLink href="#/backup" title="Backup and restore" sub={db.settings.lastBackupAt ? `Last backup ${fmtDate(ymd(db.settings.lastBackupAt))}` : 'No backup yet'} />
        <ListLink href="#/reports" title="Problem reports" sub={`${db.reports.length} report${db.reports.length === 1 ? '' : 's'} · ${db.hidden.length} hidden question${db.hidden.length === 1 ? '' : 's'}`} />
      </div>
      </div>
      <div class="col-tall">
      <div class="section">
        <h2>Reference</h2>
        <div class="list">
          <ListLink href="#/ref/facts" title="Exam facts" sub="Format, scoring, results, retakes" />
          <ListLink href="#/ref/blueprint" title="Blueprint" sub="Domains, knowledge groups, and the 100-item grid" />
          <ListLink href="#/ref/examday" title="Exam-day notes" />
          <ListLink href="#/ref/sources" title="Sources" sub="Every reference cited by questions and cards" />
        </div>
      </div>
      </div>
      <div>
      <div class="section">
        <h2>App</h2>
        <div class="list">
          <ListLink href="#/onboarding" title="Welcome and Home Screen setup" />
          <ListLink href="#/about" title="About" sub={`Version ${APP_VERSION}`} />
        </div>
      </div>
      </div>
      </div>
    </Page>
  );
}

export function Settings() {
  const db = useDb();
  const s = db.settings;
  const up = ctx.store.updateSettings.bind(ctx.store);
  const caps = ctx.caps;
  async function reset() {
    const ok = await confirmDialog({ title: 'Erase all progress?', body: 'This deletes every answer, exam, review schedule, report and setting on this device. Make a backup first if you might want it back. This cannot be undone.', ok: 'Erase everything', danger: true });
    if (!ok) return;
    const fresh = emptyState();
    fresh.settings.onboarded = true;
    await ctx.store.replaceAll(fresh);
    toast('All progress erased.');
    navigate('today', true);
  }
  const support: [string, boolean, string][] = [
    ['Secure address (HTTPS)', caps.secure, 'Needed for offline mode and the features below.'],
    ['Offline mode', caps.serviceWorker && swStatus === 'active', caps.serviceWorker ? (swStatus === 'active' ? 'App files are cached for offline use.' : 'Registering…') : 'Unavailable at this address — the app works while online.'],
    ['Share sheet for files', caps.shareFiles, caps.shareFiles ? 'Backups open the share sheet.' : 'Backups download as a file instead.'],
    ['Keep screen awake', caps.wakeLock && caps.secure, 'Used during timed sessions.'],
    ['Clipboard', caps.clipboard && caps.secure, 'Otherwise a fallback copy method is used.'],
    ['Persistent storage', s.persisted === true, s.persisted === true ? 'The browser agreed to keep this data.' : caps.persist && caps.secure ? 'Not granted yet — adding to the Home Screen helps.' : 'Not available here. Back up regularly.'],
  ];
  return (
    <Page title="Settings" backTo="more">
      <label class="field">
        <span class="label">Exam date</span>
        <input class="input" type="date" value={s.examDate ?? ''} min={ymd()} onChange={(e) => up({ examDate: (e.target as HTMLInputElement).value || null })} />
        <span class="hint">Drives the Today plan and spaced-review timing.</span>
      </label>
      <div class="field">
        <span class="label">Raw passing target</span>
        <Stepper label="raw passing target" value={s.rawTarget} min={50} max={90} onChange={(v) => up({ rawTarget: v })} suffix="/100" />
        <span class="hint">AASP doesn't publish the raw cut. The app maps this raw score to 550 for estimated scaled scores (default 70). Changing it also updates the estimates for exams you've already taken.</span>
      </div>
      <div class="field">
        <span class="label">Default exam mode</span>
        <Seg name="mode" label="Default exam mode" value={s.mode} onChange={(v) => up({ mode: v })} options={[{ v: 'strict', label: 'Strict' }, { v: 'coached', label: 'Coached' }]} />
        <span class="hint">Strict: no pausing, like the real exam. Coached: pause allowed and pacing shown.</span>
      </div>
      <div class="field">
        <span class="label">Daily study target</span>
        <Stepper label="daily study target" value={s.dailyTarget} min={10} max={150} step={10} onChange={(v) => up({ dailyTarget: v })} suffix=" questions" />
      </div>
      <div class="field">
        <span class="label">Text size</span>
        <Seg<TextSize> name="ts" label="Text size" value={s.textSize} onChange={(v) => up({ textSize: v })} options={[{ v: 's', label: 'Small' }, { v: 'm', label: 'Default' }, { v: 'l', label: 'Large' }, { v: 'xl', label: 'Larger' }]} />
      </div>
      <div class="field">
        <span class="label">Theme</span>
        <Seg<Theme> name="th" label="Theme" value={s.theme} onChange={(v) => up({ theme: v })} options={[{ v: 'system', label: 'System' }, { v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }]} />
      </div>
      <div class="field">
        <span class="label">Celebrations</span>
        <Seg<'on' | 'calm'> name="cel" label="Celebrations" value={s.celebrations === false ? 'calm' : 'on'} onChange={(v) => up({ celebrations: v === 'on' })} options={[{ v: 'on', label: 'Confetti' }, { v: 'calm', label: 'Calm' }]} />
        <span class="hint">Confetti and small animations when you get things right, finish a session, or reach your daily goal. Calm keeps the encouragement without the motion. Never during a timed exam; your device's Reduce Motion setting always wins.</span>
      </div>
      <div class="section">
        <h2>Data</h2>
        <div class="list">
          <ListLink href="#/backup" title="Backup and restore" />
          <button class="list-item" onClick={reset} style={{ color: 'var(--bad)' }}><span class="li-main"><span class="li-title">Erase all progress…</span></span></button>
        </div>
      </div>
      <div class="section">
        <details class="card device"><summary>Technical details for this device</summary>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} class="stack">
            {support.map(([name, ok, note]) => (
              <li class="row nowrap" style={{ alignItems: 'flex-start' }}>
                {ok ? <IcCheck class="status-ic ok" title="Available" /> : <IcX class="status-ic skip" title="Not available" />}
                <span><strong>{name}</strong><br /><span class="small muted">{note}</span></span>
              </li>
            ))}
          </ul>
          <p class="small muted mt" style={{ marginBottom: 0 }}>Storage: {ctx.store.kv.kind}. Each web address keeps its own separate storage — use backup and restore to move progress between addresses.</p>
        </details>
      </div>
    </Page>
  );
}

const backupLine = (s: ReturnType<typeof summarize>) => [plural(s.attempts, 'answer'), plural(s.exams, 'full exam'), plural(s.reviews, 'review entry', 'review entries'), ...(s.flash ? [plural(s.flash, 'flash fact')] : []), plural(s.reports, 'report')].join(' · ');

export function Backup() {
  const db = useDb();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);
  const sum = summarize(db);
  async function doBackup() {
    const b = makeBackup(ctx.store.state, APP_VERSION, ctx.bank.version);
    const r = await shareOrDownload(backupFilename(), JSON.stringify(b), 'application/json');
    if (r === 'cancelled') return;
    ctx.store.updateSettings({ lastBackupAt: Date.now(), backupSnoozeUntil: null });
    toast(r === 'shared' ? 'Backup shared.' : 'Backup downloaded.');
  }
  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!f) return;
    try { setPending(parseBackup(await f.text())); }
    catch (err) { await alertDialog({ title: "Can't restore that file", body: (err as Error).message }); }
  }
  async function restore() {
    if (!pending) return;
    await ctx.store.replaceAll(pending.state);
    setPending(null);
    toast('Progress restored.');
    navigate('today', true);
  }
  const ps = pending ? summarize(pending.state) : null;
  return (
    <Page title="Backup and restore" backTo="more">
      <div class="card">
        <h2>Back up</h2>
        <p>Saves everything — answers, exams in progress, review schedules, reports and settings — to one file. {ctx.caps.shareFiles ? 'The share sheet opens: choose Save to Files, AirDrop, or Mail.' : 'The file downloads to your device.'}</p>
        <p class="small muted">{backupLine(sum)}</p>
        <button class="btn primary block" onClick={doBackup}>{ctx.caps.shareFiles ? <IcShare /> : <IcDownload />}Back up now</button>
        <p class="small muted mt" style={{ marginBottom: 0 }}>Last backup: {db.settings.lastBackupAt ? new Date(db.settings.lastBackupAt).toLocaleString() : 'never'}.</p>
      </div>
      <div class="card">
        <h2>Restore</h2>
        <p>Replaces all progress on this device with a backup file.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" class="sr-only" id="restore-file" onChange={onFile} />
        <label class="btn block" for="restore-file">Choose backup file…</label>
      </div>
      <div class="banner warn" role="note"><IcAlert /><div class="small">
        <strong>Why back up?</strong> Safari may delete data for websites that aren't on the Home Screen and haven't been opened for about a week. The Home Screen app, Safari, and each web address all keep separate data — restore a backup to move progress between them. A weekly backup is a good habit.
      </div></div>
      {pending && ps && (
        <Modal title="Restore this backup?" onClose={() => setPending(null)}>
          <p>Made {new Date(pending.exportedAt).toLocaleString()} (app {pending.appVersion}).</p>
          <p class="small">{backupLine(ps)}</p>
          {pending.flashUnreadable ? <p class="small">Flash progress in this file couldn't be read. Everything else restores; flash starts fresh.</p>
            : !ps.flash && sum.flash > 0 && <p class="small">This backup has no flash drill progress, so your current flash progress ({plural(sum.flash, 'fact')}) will be cleared.</p>}
          <p><strong>Everything currently on this device will be replaced.</strong></p>
          <div class="btn-row">
            <button class="btn" onClick={() => setPending(null)}>Cancel</button>
            <button class="btn danger solid" onClick={restore}>Replace and restore</button>
          </div>
        </Modal>
      )}
    </Page>
  );
}

export function reportsMarkdown(): string {
  const st = ctx.store.state;
  const lines = [
    `# CMPC Prep — problem reports`,
    ``,
    `Exported ${new Date().toISOString()} · app ${APP_VERSION} · content ${ctx.bank.version}`,
    ``,
    `## Instructions for the fixer`,
    `Each report names an item id in \`content/items/*.json\` of the cmpc-prep repo. For each: read the report and the item, decide whether the item is wrong, ambiguous, or fine; fix it following docs/ITEM_WRITING_GUIDE.md (single best answer, rationales for every option, takeaway, refs from content/references.json); keep its id, pool, domain and kg so form grids stay intact; run \`npm run validate\`; blind-check the revised item; commit content separately from code.`,
    ``,
    `Hidden items: ${st.hidden.length ? st.hidden.join(', ') : 'none'}`,
    ``,
  ];
  for (const r of st.reports) {
    const it = ctx.items.get(r.itemId);
    lines.push(`## ${r.itemId} — ${r.kind}`, ``, `- Reported: ${new Date(r.at).toISOString()} (content ${r.contentVersion})`, `- Note: ${r.note || '(none)'}`, ``);
    if (it) lines.push('```json', JSON.stringify({ id: it.id, pool: it.pool, domain: it.domain, kg: it.kg, topic: it.topic, stem: it.stem, options: it.options, answer: it.answer, rationales: it.rationales, takeaway: it.takeaway, refs: it.refs }, null, 2), '```', '');
  }
  return lines.join('\n');
}

export function Reports() {
  const db = useDb();
  async function exportReports() {
    const r = await shareOrDownload(`cmpc-prep-reports-${ymd()}.md`, reportsMarkdown(), 'text/markdown');
    if (r !== 'cancelled') toast(r === 'shared' ? 'Reports shared.' : 'Reports downloaded.');
  }
  async function copy() { toast((await copyText(reportsMarkdown())) ? 'Copied to clipboard.' : 'Copy failed — use Export instead.'); }
  async function clear() {
    if (await confirmDialog({ title: 'Delete all reports?', body: 'Export them first if you still need them.', ok: 'Delete', danger: true })) ctx.store.set('reports', []);
  }
  return (
    <Page title="Problem reports" backTo="more">
      <p>Use <strong>Report a problem</strong> on any question to flag a wrong key, ambiguity, or typo. Export the reports as a Markdown file you can hand to someone (or an AI agent) to fix the questions.</p>
      <div class="btn-row">
        <button class="btn primary" onClick={exportReports} disabled={!db.reports.length && !db.hidden.length}><IcShare />Export</button>
        <button class="btn" onClick={copy} disabled={!db.reports.length && !db.hidden.length}>Copy</button>
      </div>
      <div class="section">
        <h2>{db.reports.length} report{db.reports.length === 1 ? '' : 's'}</h2>
        {db.reports.length ? (
          <div class="list">
            {db.reports.slice().reverse().map((r) => (
              <div class="list-item" style={{ cursor: 'default' }}><span class="li-main"><span class="li-title">{r.itemId} · {r.kind}</span><span class="li-sub" style={{ display: 'block' }}>{r.note || 'No note'} · {new Date(r.at).toLocaleDateString()}</span></span>
                <button class="btn small" onClick={() => ctx.store.set('reports', ctx.store.state.reports.filter((x) => x.id !== r.id))} aria-label={`Delete report on ${r.itemId}`}>Delete</button></div>
            ))}
          </div>
        ) : <p class="muted">No reports.</p>}
        {db.reports.length > 0 && <button class="btn danger small mt" onClick={clear}>Delete all reports</button>}
      </div>
      <div class="section">
        <h2>Hidden questions</h2>
        {db.hidden.length ? (
          <div class="list">{db.hidden.map((id) => (
            <div class="list-item" style={{ cursor: 'default' }}><span class="li-main"><span class="li-title">{id}</span><span class="li-sub" style={{ display: 'block' }}>{ctx.items.get(id)?.topic}</span></span>
              <button class="btn small" onClick={() => ctx.store.set('hidden', ctx.store.state.hidden.filter((x) => x !== id))}>Unhide</button></div>
          ))}</div>
        ) : <p class="muted">None. Hidden questions are left out of drills and mixed exams; on a form they're swapped for a matching drill question.</p>}
      </div>
    </Page>
  );
}
