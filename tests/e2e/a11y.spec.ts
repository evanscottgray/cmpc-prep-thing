import { test, expect } from '@playwright/test';
import { axe, onboard, optionLabels, shot, go } from './helpers';

// Playwright's WebKit build crashes while executing axe-core (any version, even on a blank page),
// so the accessibility scan runs in Chromium at the same viewport sizes. Every other E2E test runs in WebKit.
test.use({ browserName: 'chromium' });

for (const scheme of ['light', 'dark'] as const) {
  test(`accessibility scan and screenshots (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('./');
    await axe(page, 'onboarding');
    await onboard(page);
    const pages: [string, string][] = [['today', 'Today'], ['study', 'Study'], ['cards', 'Concept cards'], ['progress', 'Progress'], ['more', 'More'], ['settings', 'Settings'], ['backup', 'Backup and restore'], ['ref/blueprint', 'Blueprint'], ['ref/facts', 'Exam facts'], ['about', 'About'], ['reports', 'Problem reports']];
    for (const [hash, h] of pages) {
      await go(page, `${hash}`);
      await expect(page.getByRole('heading', { name: h, level: 1 })).toBeVisible();
      await axe(page, `${scheme} ${hash}`);
      await shot(page, `a11y-${scheme}-${hash.replace('/', '-')}`);
    }
    // exam screen + navigator + results + review + tutor
    await go(page, 'start/mixed');
    await expect(page.getByRole('heading', { name: 'Mixed exam', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Start Mixed exam' }).click();
    await optionLabels(page).nth(2).click();
    await page.getByRole('button', { name: 'Strike out option A' }).click();
    await axe(page, `${scheme} exam`);
    await shot(page, `a11y-${scheme}-exam`);
    await page.getByRole('button', { name: /^Navigator/ }).click();
    await axe(page, `${scheme} navigator`);
    await shot(page, `a11y-${scheme}-navigator`);
    await page.getByRole('button', { name: 'End exam…' }).click();
    await page.getByRole('button', { name: 'End exam and score' }).click();
    await expect(page.getByRole('heading', { name: /results/ })).toBeVisible();
    await axe(page, `${scheme} results`);
    await shot(page, `a11y-${scheme}-results`);
    await page.getByRole('link', { name: 'Start with one miss' }).click(); // a long review starts with the first rationale
    await expect(page.locator('.q-meta')).toBeVisible();
    await axe(page, `${scheme} review item`);
    await shot(page, `a11y-${scheme}-review-item`);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.locator('.list .list-item').first()).toBeVisible();
    await axe(page, `${scheme} review list`);
    await go(page, 'today');
    await page.getByRole('button', { name: 'Quick quiz · 10', exact: true }).click();
    await optionLabels(page).nth(0).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await axe(page, `${scheme} tutor feedback`);
    await shot(page, `a11y-${scheme}-tutor`);
  });
}
