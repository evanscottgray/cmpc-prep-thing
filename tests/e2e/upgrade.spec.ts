import { test, expect, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { optionLabels } from './helpers';

// Upgrade from the previous release (its committed dist/, extracted by scripts/e2e-docker.mjs) to this build,
// through the real service-worker update, with a timed block running and a second tab left on the old version.
const OLD = '.work/upgrade/old', LIVE = '.work/upgrade/live', PORT = 4316, BASE = `http://localhost:${PORT}/up/`;
// The old build's entry script: a page running it is still on the old code.
const oldEntry = () => fs.readFileSync(`${OLD}/index.html`, 'utf8').match(/assets\/(index-[\w-]+\.js)/)![1];
const onOld = (page: Page) => page.evaluate((e) => [...document.scripts].some((s) => s.src.endsWith(e)), oldEntry());
const swap = (from: string) => { fs.rmSync(LIVE, { recursive: true, force: true }); fs.cpSync(from, LIVE, { recursive: true }); };

const dumpDb = (page: Page) => page.evaluate(async () => {
  const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open('cmpc-prep', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const req = <T,>(q: IDBRequest<T>) => new Promise<T>((res) => { q.onsuccess = () => res(q.result); });
  const keys = await req(db.transaction('kv').objectStore('kv').getAllKeys());
  const out: Record<string, string> = {};
  for (const k of keys) out[String(k)] = JSON.stringify(await req(db.transaction('kv').objectStore('kv').get(k)));
  db.close();
  return out;
});
const changed = (a: Record<string, string>, b: Record<string, string>) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]).sort();
async function controlled(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.reload();
    if (await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).then(() => true, () => false)) return;
  }
  throw new Error('no service worker in control');
}

test('upgrading from the previous release keeps every record, mid-exam included', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'iphone-15', 'one size is enough for an upgrade path');
  test.skip(!fs.existsSync(`${OLD}/index.html`), 'needs the previous release build (npm run e2e extracts it)');
  test.setTimeout(180_000);
  swap(OLD);
  const server = spawn('node', ['scripts/serve.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--dir', LIVE, '--base', '/up/'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 50 && !(await fetch(BASE).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100));

    // The old version: onboard, answer a warm-up question, rate a card, a flash round, start a timed block and answer two.
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue in Safari' }).click();
    const d = new Date(); d.setDate(d.getDate() + 21);
    await page.getByLabel('Exam date').fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    await page.getByRole('button', { name: 'Start studying' }).click();
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 30000 });
    await controlled(page);
    expect(await onOld(page)).toBe(true); // really the old app
    await expect(page.getByRole('button', { name: 'Flash · 10' })).toBeVisible();
    await page.getByRole('button', { name: 'Start the warm-up' }).first().click();
    await optionLabels(page).nth(0).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.evaluate(() => { location.hash = '#/cards/study'; });
    await page.getByRole('button', { name: 'Show card' }).click();
    await page.getByRole('button', { name: 'Knew it' }).click();
    // a flash round on the old version too, so flash progress is carried over
    await page.evaluate(() => { location.hash = '#/flash?n=2'; });
    for (let n = 0; n < 6 && !(await page.getByRole('heading', { name: /Round complete/ }).count()); n++) {
      if (await page.locator('.tf-row').count()) await page.getByRole('button', { name: /^False/ }).click(); else await page.locator('.flash-opt').nth(1).click();
      await page.getByRole('button', { name: /^(Next|See summary)$/ }).click();
    }
    await expect(page.getByRole('heading', { name: /Round complete/ })).toBeVisible();
    await page.evaluate(() => { location.hash = '#/start/block'; });
    await page.getByRole('button', { name: /^Start / }).click();
    await optionLabels(page).nth(1).click();
    await page.getByRole('button', { name: /^Next/ }).click();
    await optionLabels(page).nth(2).click();
    const examHash = await page.evaluate(() => location.hash);

    // A second tab stays on the old code throughout.
    const tab2 = await context.newPage();
    await tab2.goto(BASE);
    await expect(tab2.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    // The new version is published; the update downloads but is never offered while the block runs.
    swap('dist');
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await expect(page.getByText('Update ready.')).toHaveCount(0);
    await page.evaluate(() => { location.hash = '#/today'; });
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(page.getByText('Update ready.')).toHaveCount(0);
    await page.evaluate((h) => { location.hash = h; }, examHash);
    await page.getByRole('button', { name: 'Exam menu' }).click();
    await page.getByRole('button', { name: 'Submit now' }).click();
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByRole('heading', { name: /summary|results/, level: 1 })).toBeVisible();
    const resultsHash = (await page.evaluate(() => location.hash)).replace('#/s/', '#/results/');
    await expect(page.getByText('Update ready.')).toBeVisible(); // offered once nothing timed is running
    const score = await page.locator('main').innerText();
    await page.waitForTimeout(300);
    const before = await dumpDb(page);

    // Update now: the new code loads over the same data, and nothing in it is rewritten.
    await page.evaluate(() => { location.hash = '#/today'; });
    await page.getByRole('button', { name: 'Update now' }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible({ timeout: 30000 });
    await expect.poll(() => onOld(page).catch(() => true), { timeout: 30000 }).toBe(false); // the reload may still be under way
    await page.waitForTimeout(300);
    const upgraded = await dumpDb(page);
    expect(changed(before, upgraded)).toEqual([]);
    await page.evaluate((h) => { location.hash = h; }, resultsHash);
    await expect(page.getByRole('heading', { name: /summary|results/, level: 1 })).toBeVisible();
    expect(await page.locator('main').innerText()).toBe(score); // the same result, figure for figure

    // A flash round writes only its own key.
    await page.evaluate(() => { location.hash = '#/flash?n=3'; });
    for (let n = 0; n < 8 && !(await page.getByRole('heading', { name: /Round complete/ }).count()); n++) {
      if (await page.locator('.tf-row').count()) await page.getByRole('button', { name: /^True/ }).click(); else await page.locator('.flash-opt').first().click();
      await page.getByRole('button', { name: /^(Next|See summary)$/ }).click();
    }
    await expect(page.getByRole('heading', { name: /Round complete/ })).toBeVisible();
    await page.waitForTimeout(300);
    const flashed = await dumpDb(page);
    expect(changed(upgraded, flashed)).toEqual(['flash']);

    // The tab still running the old code rates a card: it writes its own parts and leaves flash progress alone.
    expect(await onOld(tab2)).toBe(true); // still the old code
    await tab2.evaluate(() => { location.hash = '#/cards/study'; });
    await tab2.getByRole('button', { name: 'Show card' }).click();
    await tab2.getByRole('button', { name: 'Missed it' }).click();
    await tab2.waitForTimeout(300);
    const mixed = await dumpDb(tab2);
    expect(changed(flashed, mixed).every((k) => k === 'cardSrs' || k === 'meta')).toBe(true);
    expect(changed(flashed, mixed)).toContain('cardSrs');
    expect(mixed.flash).toBe(flashed.flash);
    await tab2.close();

    // Offline after the update: the new code and the drill still load.
    await page.evaluate(() => { location.hash = '#/today'; });
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await page.evaluate(() => { location.hash = '#/flash?n=1'; });
    await expect(page.locator('#flash-prompt')).toBeVisible();
    await context.setOffline(false);
  } finally {
    server.kill();
  }
});
