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
    // flash drill: setup, question, verdict with the card, summary
    await go(page, 'study');
    await page.getByRole('button', { name: /Flash drill/ }).click();
    await axe(page, `${scheme} flash setup`);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await go(page, 'flash?n=2');
    await expect(page.locator('#flash-prompt')).toBeVisible();
    await axe(page, `${scheme} flash question`);
    for (let n = 0; n < 6 && !(await page.getByRole('heading', { name: /Round complete/ }).count()); n++) {
      if (await page.locator('.tf-row').count()) await page.getByRole('button', { name: /^False/ }).click(); else await page.locator('.flash-opt').nth(1).click();
      if (n === 0) {
        await axe(page, `${scheme} flash verdict`); await shot(page, `a11y-${scheme}-flash-verdict`);
        await page.getByRole('button', { name: 'Read the concept card' }).click();
        await axe(page, `${scheme} flash card modal`);
        await page.getByRole('button', { name: 'Back to the drill' }).click();
      }
      await page.getByRole('button', { name: /^(Next|See summary)$/ }).click();
    }
    await expect(page.getByRole('heading', { name: /Round complete/ })).toBeVisible();
    await axe(page, `${scheme} flash summary`);
    await shot(page, `a11y-${scheme}-flash-summary`);
    // exam screen + navigator + results + review + tutor
    await go(page, 'start/mixed');
    await expect(page.getByRole('heading', { name: 'Mixed exam', level: 1 })).toBeVisible();
    await page.getByRole('radio', { name: 'Untimed' }).check({ force: true });
    await axe(page, `${scheme} exam intro, untimed`);
    await page.getByRole('radio', { name: 'Standard' }).check({ force: true });
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
    await page.getByRole('button', { name: /^(Quick quiz · 10|Start the warm-up)$/ }).last().click();
    await optionLabels(page).nth(0).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await axe(page, `${scheme} tutor feedback`);
    await shot(page, `a11y-${scheme}-tutor`);
  });
}
