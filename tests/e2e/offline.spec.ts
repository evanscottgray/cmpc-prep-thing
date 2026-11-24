import { test, expect, type Page } from '@playwright/test';
import os from 'node:os';
import { onboard, optionLabels, go } from './helpers';

/** WebKit can serve a reload issued within milliseconds of activation without the worker; the next load has it. */
async function controlledReload(page: Page) {
  for (let i = 0; i < 3; i++) { // generous: under a full parallel run WebKit can take several seconds to hand control over
    await page.reload();
    const ok = await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).then(() => true, () => false);
    if (ok) return;
  }
  throw new Error('no service worker in control after three reloads');
}

test('installable and fully offline after the first visit on localhost', async ({ page, context }) => {
  await onboard(page);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  const manifest = await page.evaluate(async () => (await fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href)).json());
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i: any) => i.sizes === '512x512')).toBe(true);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 30000 });
  await controlledReload(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await go(page, 'start/formA');
  await expect(page.getByRole('heading', { name: 'Form A', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start Form A' }).click();
  await optionLabels(page).nth(0).click();
  await expect(page.locator('.qcount')).toContainText('Question 1');
  await context.setOffline(false);
});

test('fully usable at a plain-HTTP LAN address (no service worker, share, wake lock)', async ({ page }) => {
  const ip = Object.values(os.networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address;
  test.skip(!ip, 'no LAN interface');
  const port = Number(process.env.E2E_LAN_PORT || 4311);
  const base = `http://${ip}:${port}/`;
  await page.goto(base);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
  await expect(page.getByRole('heading', { name: /Prepare for the CMPC/ })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/plain-HTTP address/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue in Safari' }).click();
  await page.getByRole('button', { name: 'Start studying' }).click();
  await go(page, 'settings');
  await page.getByText('Technical details for this device').click();
  await expect(page.getByText('Unavailable at this address — the app works while online.')).toBeVisible();
  await go(page, 'start/formA');
  await expect(page.getByRole('heading', { name: 'Form A', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start Form A' }).click();
  await optionLabels(page).nth(1).click();
  await page.reload();
  await expect(page.locator('.opt').nth(1)).toHaveClass(/selected/);
  await go(page, 'backup');
  await expect(page.getByRole('heading', { name: 'Backup and restore', level: 1 })).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Back up now/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/cmpc-prep-backup-.*\.json/);
  await go(page, 'reports');
  expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistration?.()) ?? null)).toBeNull();
});

test('works from a project subpath, as on GitHub Pages, including offline and update checks', async ({ page, context }) => {
  const base = `http://localhost:${Number(process.env.E2E_PAGES_PORT || 4312)}/some-repo/`;
  const missing: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  await page.goto(base.slice(0, -1)); // no trailing slash: redirected
  await expect(page.getByRole('heading', { name: /Prepare for the CMPC/ })).toBeVisible();
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 30000 });
  expect(await page.evaluate(async () => new URL((await navigator.serviceWorker.getRegistration())!.scope).pathname)).toBe('/some-repo/');
  await controlledReload(page);
  await expect(page.getByText('Update ready.')).toHaveCount(0);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Prepare for the CMPC/ })).toBeVisible();
  await context.setOffline(false);
  expect(missing).toEqual([]);
});
