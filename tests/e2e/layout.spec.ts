import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { go, onboard, optionLabels } from './helpers';

const small = () => {
  const out: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('button, a[href], select, input, label.opt-main, .nav-cell')) {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || el.closest('[inert]')) continue;
    let r = el.getBoundingClientRect();
    if (el.matches('input[type=radio], input[type=checkbox], input[type=file]')) { const l = el.closest('label'); if (!l) continue; r = l.getBoundingClientRect(); }
    if (el.matches('.skip') || r.width === 0 || r.height === 0) continue;
    if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName}.${el.className} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
};
const overflow = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;

for (const size of ['m', 'xl'] as const) {
  test(`touch targets are at least 44px and nothing scrolls sideways (text ${size})`, async ({ page }) => {
    await onboard(page);
    if (size === 'xl') { await go(page, 'settings'); await page.getByRole('radio', { name: 'Larger' }).check({ force: true }); }
    const visit = async (label: string) => { expect.soft(await page.evaluate(small), `${label}: small targets`).toEqual([]); expect.soft(await page.evaluate(overflow), `${label}: sideways scroll`).toBeLessThanOrEqual(0); };
    for (const [h, t] of [['today', 'Today'], ['study', 'Study'], ['cards', 'Concept cards'], ['progress', 'Progress'], ['more', 'More'], ['settings', 'Settings'], ['backup', 'Backup and restore'], ['reports', 'Problem reports'], ['ref/blueprint', 'Blueprint'], ['ref/facts', 'Exam facts'], ['about', 'About']]) {
      await go(page, h); await expect(page.getByRole('heading', { name: t, level: 1 })).toBeVisible(); await visit(h);
    }
    await go(page, 'start/block');
    await page.getByRole('radio', { name: 'Coached' }).check({ force: true });
    await page.getByRole('button', { name: 'Start Exam-pace block' }).click();
    await expect(page.locator('.qcount')).toContainText('Question 1'); await visit('exam');
    await page.getByRole('button', { name: /^Navigator/ }).click(); await visit('navigator');
    const end = page.getByRole('button', { name: 'Submit…' });
    await expect(end).toBeInViewport(); // reachable without scrolling past every question
    await page.getByRole('button', { name: 'Back to question' }).click();
    await page.getByRole('button', { name: 'Exam menu' }).click(); await visit('menu');
    await page.getByRole('button', { name: /Hide this question/ }).click();
    await go(page, 'today');
    await page.getByRole('button', { name: 'Quick quiz · 10' }).click();
    await expect(page.getByRole('button', { name: 'Report a problem' })).toBeVisible(); // before answering too
    await optionLabels(page).nth(0).click(); await page.getByRole('button', { name: 'Check answer' }).click(); await visit('tutor');
  });
}

test('an empty exam date field stays inside its column (iOS gives date inputs a minimum width)', async ({ page }) => {
  const fits = async () => {
    const date = page.getByLabel('Exam date');
    await expect(date).toHaveValue('');
    const [d, f] = await Promise.all([date.boundingBox(), date.locator('xpath=ancestor::*[contains(@class,"field")][1]').boundingBox()]);
    expect(d!.x + d!.width).toBeLessThanOrEqual(f!.x + f!.width + 0.5);
    expect(await date.evaluate((e) => getComputedStyle(e).appearance)).toBe('none');
    expect(await page.evaluate(overflow)).toBeLessThanOrEqual(0);
  };
  await page.goto('./');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue in Safari' }).click();
  await fits();
  await page.getByRole('button', { name: 'Start studying' }).click();
  await go(page, 'settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await fits();
});

test('the navigator shows whole rows of questions with a phone held sideways', async ({ page }) => {
  await onboard(page);
  await page.setViewportSize({ width: 568, height: 320 });
  await go(page, 'settings'); await page.getByRole('radio', { name: 'Larger' }).check({ force: true });
  await go(page, 'start/block');
  await page.getByRole('button', { name: /^Start Exam-pace block/ }).click();
  await page.getByRole('button', { name: /^Navigator/ }).click();
  const box = await page.locator('.nav-scroll').evaluate((el) => el.clientHeight);
  expect(box).toBeGreaterThanOrEqual(2 * 48 + 8); // room for two full rows of question buttons
  await expect(page.locator('.nav-cell').first()).toBeInViewport({ ratio: 1 });
  for (const name of ['Back to question', 'Submit…']) await expect(page.getByRole('button', { name })).toBeInViewport({ ratio: 1 });
});

test('tutor controls stay on screen with a phone held sideways', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Quick quiz · 10' }).click();
  await expect(page.getByText('Question 1 of 10')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toHaveCount(0); // nothing to go back to
  await optionLabels(page).nth(0).click(); await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('button', { name: 'Next question' }).click();
  const quiz = await page.evaluate(() => location.hash);
  for (const [w, h] of [[667, 375], [568, 320]]) {
    for (const size of ['Default', 'Larger']) {
      await page.setViewportSize({ width: w, height: h });
      await go(page, 'settings'); await page.getByRole('radio', { name: size }).check({ force: true });
      await go(page, quiz);
      for (const name of ['Previous', 'Check answer']) await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByLabel(/I'm not sure/)).toBeInViewport();
    }
  }
});

test('runs from a subpath on a static host', async ({ page }) => {
  const root = path.resolve('dist');
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const missing: string[] = [];
  const srv = http.createServer((q, r) => {
    const u = new URL(q.url!, 'http://x').pathname;
    const f = u.startsWith('/a/b/') ? path.join(root, u.slice(5) || 'index.html') : '';
    if (!f || !fs.existsSync(f)) { missing.push(u); r.writeHead(404).end(); return; }
    r.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' }); r.end(fs.readFileSync(f));
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  await page.goto(`http://localhost:${(srv.address() as any).port}/a/b/`);
  await expect(page.getByRole('heading', { name: /Prepare for the CMPC/ })).toBeVisible();
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  expect(missing.filter((m) => m !== '/favicon.ico')).toEqual([]);
  srv.close();
});

test('makes no third-party requests', async ({ page, baseURL }) => {
  const foreign: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(baseURL!) && !/^(data|blob|about):/.test(r.url())) foreign.push(r.url()); });
  await onboard(page);
  for (const h of ['study', 'cards', 'progress', 'ref/sources', 'about']) await go(page, h);
  await page.waitForTimeout(500);
  expect(foreign).toEqual([]);
});

test('two tabs do not overwrite each other', async ({ page, context }) => {
  await onboard(page);
  const b = await context.newPage();
  await b.goto('./#/reports'); await expect(b.getByRole('heading', { name: 'Problem reports' })).toBeVisible();
  for (const tab of [page, b]) {
    await go(tab, 'today');
    if (tab === page) await tab.getByRole('button', { name: 'Quick quiz · 10' }).click();
    else { await tab.getByRole('link', { name: /Quick quiz.*Resume/ }).click(); await tab.getByRole('button', { name: 'Next question' }).click(); } // the second tab resumes the first tab's quiz
    await optionLabels(tab).nth(0).click(); await tab.getByRole('button', { name: 'Check answer' }).click();
    await expect(tab.locator('#verdict')).toBeVisible(); await tab.waitForTimeout(600);
  }
  await go(page, 'progress');
  await expect(page.locator('.stat', { hasText: 'Total answers' }).locator('.v')).toHaveText('2');
});
