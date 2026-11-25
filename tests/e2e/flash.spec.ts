import { test, expect, type Page } from '@playwright/test';
import { go, onboard, optionLabels, shot } from './helpers';
// The axe scan of these screens runs in a11y.spec.ts (Chromium): Playwright's WebKit crashes running axe-core.

/** Every key in the app's IndexedDB store, as stored (JSON text), so "unchanged" means byte-identical. */
const dumpDb = (page: Page) => page.evaluate(async () => {
  const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('cmpc-prep', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const req = <T,>(q: IDBRequest<T>) => new Promise<T>((res) => { q.onsuccess = () => res(q.result); });
  const keys = await req(db.transaction('kv').objectStore('kv').getAllKeys());
  const out: Record<string, string> = {};
  for (const k of keys) out[String(k)] = JSON.stringify(await req(db.transaction('kv').objectStore('kv').get(k)));
  db.close();
  return out;
});
/** Progress as text, without the flash tile (the one thing a flash round should change there). */
const progressText = async (page: Page) => {
  await go(page, 'progress');
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  const t = await page.locator('main').evaluate((m) => { const c = m.cloneNode(true) as HTMLElement; c.querySelectorAll('.stat').forEach((s) => { if (s.textContent?.includes('Flash facts')) s.remove(); }); return c.innerText; });
  return t.replace(/This week: [^.]*\./, ''); // the study-day count may grow by design; checked on Today
};
const dailyLine = async (page: Page) => { await go(page, 'today'); return page.locator('.card.daily .row').first().innerText(); };

type Fact = { prompt: string; type: 'mc' | 'tf'; options?: string[]; answer: number | boolean };
/** Answers whatever fact is showing: by keyboard, or rightly / wrongly on purpose (the key is read from the bank), or by its first choice. */
async function answerFact(page: Page, how: 'key' | 'right' | 'wrong' | 'any' = 'any') {
  const tf = await page.locator('.tf-row').count();
  if (how === 'key') await page.keyboard.press(tf ? 't' : '1');
  else if (how === 'any') { if (tf) await page.getByRole('button', { name: /^True/ }).click(); else await page.locator('.flash-opt').first().click(); }
  else {
    const prompt = await page.locator('#flash-prompt').innerText();
    const f: Fact = await page.evaluate(async (p) => (await (await fetch('./data/bank.json')).json()).flash.find((x: Fact) => x.prompt === p), prompt);
    if (f.type === 'tf') await page.getByRole('button', { name: new RegExp(`^${(f.answer === (how === 'right')) ? 'True' : 'False'}`) }).click();
    else {
      const key = f.options![f.answer as number];
      const opts = page.locator('.flash-opt');
      const texts = await opts.allInnerTexts();
      const k = texts.findIndex((t) => t.endsWith(key));
      await opts.nth(how === 'right' ? k : (k + 1) % texts.length).click();
    }
  }
  await expect(page.locator('#flash-verdict')).toBeVisible();
}

test('a flash round saves only flash progress; exam records, scores and goals are untouched', async ({ page }) => {
  // Ordinary study happens "yesterday"; the flash round "today", so the streak can be seen to grow by exactly one day.
  const noon = (back: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - back); return d; };
  await page.clock.install({ time: noon(1) });
  await onboard(page);
  // A scored Form A sitting (ended early), two quiz answers and one rated card.
  await go(page, 'start/formA');
  await page.getByRole('button', { name: /^Start Form A/ }).click();
  await optionLabels(page).nth(0).click();
  await page.getByRole('button', { name: /^Next/ }).click();
  await optionLabels(page).nth(1).click();
  await page.getByRole('button', { name: /^Navigator/ }).click();
  await page.getByRole('button', { name: 'End exam…' }).click();
  await page.getByRole('button', { name: 'End exam and score' }).click();
  await expect(page.getByRole('heading', { name: /results/ })).toBeVisible();
  await go(page, 'today');
  await page.getByRole('button', { name: /^(Quick quiz · 10|Start the warm-up)$/ }).last().click();
  for (let q = 1; q <= 2; q++) {
    await expect(page.getByText(`Question ${q} of 10`)).toBeVisible();
    await optionLabels(page).nth(1).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.getByRole('button', { name: 'Next question' }).click();
  }
  await go(page, 'cards/study');
  await page.getByRole('button', { name: 'Show card' }).click();
  await page.getByRole('button', { name: 'Missed it' }).click();
  await page.waitForTimeout(300);
  await page.clock.setSystemTime(noon(0));
  await page.reload();

  await go(page, 'today');
  await expect(page.locator('.streak-title')).not.toContainText('in a row'); // nothing yet today
  const progressBefore = await progressText(page);
  expect(progressBefore).toMatch(/Form A/); // an exam in history
  const dailyBefore = await dailyLine(page);
  const before = await dumpDb(page);
  expect(before.flash).toBeUndefined();

  // Start from Study: the setup modal, then a round of 10.
  await page.getByRole('link', { name: 'Study', exact: true }).click();
  await expect(page.getByRole('button', { name: /Flash drill/ })).toContainText('New');
  await page.getByRole('button', { name: /Flash drill/ }).click();
  await expect(page.getByRole('dialog')).toContainText(/\d+ facts · 0 due · \d+ new/);
  await shot(page, '60-flash-setup');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fact 1 of 10' })).toBeVisible();
  await expect(page.locator('#flash-prompt')).toBeFocused();
  await expect(page.locator('.tabbar')).toHaveCount(0);
  await shot(page, '61-flash-question');

  // Keyboard answer, verdict focused; the concept card opens over the round and closes back to it.
  await answerFact(page, 'key');
  await expect(page.locator('#flash-verdict')).toBeFocused();
  await shot(page, '62-flash-verdict');
  const prompt = await page.locator('#flash-prompt').innerText();
  await page.getByRole('button', { name: 'Read the concept card' }).click();
  await expect(page.getByRole('dialog')).toContainText('On the exam:');
  await page.getByRole('button', { name: 'Back to the drill' }).click();
  await expect(page.locator('#flash-prompt')).toHaveText(prompt);
  await expect(page.getByRole('button', { name: 'Read the concept card' })).toBeFocused(); // focus returns to what opened it
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Fact 2 of 10' })).toBeVisible();
  await answerFact(page, 'wrong'); // a sure miss: it must come back at the end of the round
  await expect(page.locator('#flash-verdict')).toContainText('comes back at the end of the round');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Fact 3 of 10' })).toBeVisible();
  await answerFact(page, 'right'); // a sure hit, then "That was a guess"
  await page.getByRole('button', { name: 'That was a guess' }).click();
  await expect(page.locator('#flash-verdict')).toContainText('Noted as a guess');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Fact 4 of 10' })).toBeVisible();
  await answerFact(page, 'key');
  await expect(page.locator('#flash-verdict')).toBeFocused();
  await page.keyboard.press('Enter'); // from the focused verdict
  await expect(page.getByRole('heading', { name: /Fact 5 of 10|One more try/ })).toBeVisible();

  let guessed = true, retries = 0;
  for (let n = 0; n < 40 && !(await page.getByRole('heading', { name: /Round complete/ }).count()); n++) {
    await answerFact(page);
    if (await page.getByRole('heading', { name: 'One more try' }).count()) retries++;
    if (!guessed && await page.getByRole('button', { name: 'That was a guess' }).count()) {
      await page.getByRole('button', { name: 'That was a guess' }).click();
      await expect(page.locator('#flash-verdict')).toContainText('Noted as a guess');
      guessed = true;
    }
    await page.getByRole('button', { name: /^(Next|See summary)$/ }).click();
  }
  await expect(page.getByRole('heading', { name: /Round complete/ })).toBeVisible();
  await expect(page.getByText(/of 10 right on the first try/)).toBeVisible();
  await expect(page.getByText('Flash facts count toward your study streak, not the daily question goal or your exam scores.')).toBeVisible();
  await shot(page, '63-flash-summary');
  expect(retries).toBeGreaterThanOrEqual(1); // the miss came back
  await go(page, 'today');
  await expect(page.locator('.streak-title')).toHaveText('2 days in a row'); // flash study counts toward the streak

  // Exactly one key changed: flash. Every legacy record is byte-identical.
  await page.waitForTimeout(300);
  const after = await dumpDb(page);
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  expect(changed).toEqual(['flash']);
  const flash = JSON.parse(after.flash);
  expect(Object.keys(flash.srs)).toHaveLength(10);
  expect(await dailyLine(page)).toBe(dailyBefore);
  expect(await progressText(page)).toBe(progressBefore);

  // It survives a reload, and Progress counts it.
  await page.reload();
  await go(page, 'progress');
  await expect(page.locator('.stat', { hasText: 'Flash facts practised' })).toContainText(/^10\/\d+/);
  await shot(page, '64-progress-flash');
});

test('restoring a backup without flash progress says it will be cleared', async ({ page }) => {
  await onboard(page);
  await go(page, 'flash?n=10');
  await answerFact(page);
  await page.waitForTimeout(300);
  await go(page, 'backup');
  const legacy = { app: 'cmpc-prep', kind: 'backup', schema: 1, exportedAt: new Date().toISOString(), appVersion: '1.3.0', contentVersion: 'x',
    state: { settings: { onboarded: true }, attempts: [], sessions: {}, srs: {}, cardSrs: {}, reports: [], hidden: [], meta: { createdAt: 1, schema: 1 } } };
  await page.locator('#restore-file').setInputFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) });
  await expect(page.getByRole('dialog')).toContainText('This backup has no flash drill progress, so your current flash progress (1 fact) will be cleared.');
  await shot(page, '65-restore-flash-note');
});

test('Today offers a flash round, and a due fact shows under due reviews', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Flash · 10' }).click();
  await expect(page.getByRole('heading', { name: 'Fact 1 of 10' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Study', level: 1 }).or(page.getByRole('heading', { name: 'Today', level: 1 }))).toBeVisible();
  // Make one fact due: answer it wrong-or-right, then move its due date to today.
  await go(page, 'flash?n=1');
  await answerFact(page);
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('cmpc-prep', 1); r.onsuccess = () => res(r.result); });
    const st = db.transaction('kv', 'readwrite').objectStore('kv');
    const g = st.get('flash');
    await new Promise((res) => { g.onsuccess = res; });
    const f = g.result; for (const e of Object.values(f.srs) as { due: string }[]) e.due = '2020-01-01';
    st.put(f, 'flash');
    await new Promise((res) => { st.transaction.oncomplete = res; });
  });
  await page.reload();
  await go(page, 'today');
  await expect(page.getByRole('button', { name: /Flash drill.*1 due/ })).toBeVisible();
  await shot(page, '66-today-flash-due');
});
