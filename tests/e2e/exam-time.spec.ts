import { test, expect } from '@playwright/test';
import { onboard, optionLabels, go, shot } from './helpers';

test('untimed exam: no clock, never submits itself, scored with a note', async ({ page }) => {
  await page.clock.install();
  await onboard(page);
  await go(page, 'start/formA');
  await expect(page.getByRole('heading', { name: 'Form A', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'Untimed' }).check({ force: true });
  await expect(page.getByRole('radio', { name: 'Coached' })).toHaveCount(0); // nothing to pause without a clock
  await expect(page.getByText('115 questions, untimed.')).toBeVisible();
  await shot(page, 'time-01-intro-untimed');
  await page.getByRole('button', { name: 'Start Form A · Untimed' }).click();
  await expect(page.locator('.qcount')).toContainText('Question 1');
  await expect(page.locator('.timer')).toHaveCount(0);
  await expect(page.locator('.exam-bar')).toContainText('Untimed');
  await optionLabels(page).nth(1).click();
  await shot(page, 'time-02-exam-untimed');

  // away for four hours: still running, nothing submitted
  await page.goto('about:blank');
  await page.clock.fastForward('04:00:00');
  await page.goto('./#/today');
  await expect(page.getByRole('heading', { name: /Resume Form A/ })).toBeVisible();
  await expect(page.getByText('Untimed: pick up where you left off.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: "Time's up" })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.opt').nth(1)).toHaveClass(/selected/);

  await page.getByRole('button', { name: 'Exam menu' }).click();
  await page.getByRole('button', { name: 'End exam now' }).click();
  await page.getByRole('button', { name: 'End exam and score' }).click();
  await expect(page.getByRole('heading', { name: 'Form A results' })).toBeVisible();
  await expect(page.getByText('Practice result, estimated · untimed')).toBeVisible();
  await expect(page.getByText('Taken untimed.')).toBeVisible();
  await expect(page.getByText('Time used (untimed)')).toBeVisible();
  await expect(page.getByText(/Time ran out/)).toHaveCount(0);
  await shot(page, 'time-03-results-untimed');
  await go(page, 'progress');
  await expect(page.locator('.list-item', { hasText: 'Form A' }).first()).toContainText('· untimed');
});

test('double time: 180 minutes with pacing at 94 s, counted like a standard sitting', async ({ page }) => {
  await page.clock.install();
  await onboard(page);
  await go(page, 'start/formB');
  await expect(page.getByRole('heading', { name: 'Form B', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'Double time' }).check({ force: true });
  await page.getByRole('radio', { name: 'Coached' }).check({ force: true });
  await expect(page.getByText('115 questions in 180 minutes')).toBeVisible();
  await page.getByRole('button', { name: 'Start Form B · Double time · Coached' }).click();
  await expect(page.locator('.timer')).toContainText('2:59:');
  await expect(page.locator('.exam-pace')).toContainText('about 94 s per question');
  await optionLabels(page).nth(0).click();
  await shot(page, 'time-04-exam-double');

  // past the standard 90 minutes: still going
  await page.goto('about:blank');
  await page.clock.fastForward('01:31:00');
  await page.goto('./#/today');
  await expect(page.getByRole('dialog', { name: "Time's up" })).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.timer')).toContainText('1:28:');

  // past 180 minutes: submitted at the double-time limit
  await page.goto('about:blank');
  await page.clock.fastForward('01:30:00');
  await page.goto('./#/today');
  await expect(page.getByRole('dialog', { name: "Time's up" })).toBeVisible();
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByRole('heading', { name: 'Form B results' })).toBeVisible();
  await expect(page.getByText('Practice result, estimated · double time')).toBeVisible();
  await expect(page.getByText('Taken untimed.')).toHaveCount(0); // an accommodation, not a caveat
  await expect(page.getByText('Time used of 3 h')).toBeVisible();
  await expect(page.getByText('target 94 s or less', { exact: false })).toBeVisible();
  await go(page, 'progress');
  await expect(page.locator('.list-item', { hasText: 'Form B' }).first()).toContainText('· double time');
});

test('standard time is still the default and unchanged', async ({ page }) => {
  await onboard(page);
  await go(page, 'start/mixed');
  await expect(page.getByRole('radio', { name: 'Standard' })).toBeChecked();
  await page.getByRole('button', { name: 'Start Mixed exam · Strict' }).click();
  await expect(page.locator('.timer')).toContainText('1:29:');
});
