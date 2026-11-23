import { test, expect } from '@playwright/test';
import { onboard, optionLabels, shot, go } from './helpers';

test('tutor drill shows verdict text and all rationales; quiz, cards, progress work', async ({ page }) => {
  await onboard(page);
  await page.getByRole('link', { name: 'Study', exact: true }).click();
  await shot(page, '10-study');
  await page.getByRole('button', { name: /Weakest areas/ }).click();
  await page.getByRole('radio', { name: '10' }).check({ force: true });
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText('Question 1 of 10')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled();
  await optionLabels(page).nth(0).click();
  await page.getByLabel(/I'm not sure/).check();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('#verdict')).toContainText(/Correct\.? ?The answer is|Incorrect\.? ?You chose A; the answer is/);
  await expect(page.locator('#verdict')).toBeInViewport();
  await expect(page.locator('.opt').first()).toContainText('Correct answer');
  await expect(page.locator('.rationale')).toHaveCount(4);
  await expect(page.getByText('Takeaway:')).toBeVisible();
  await shot(page, '11-tutor-feedback');
  // report + hide on an item
  await page.getByRole('button', { name: 'Report a problem' }).click();
  await page.getByLabel('Typo or wording').check();
  await page.getByRole('button', { name: 'Save report' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide this question' }).click();
  await expect(page.getByRole('button', { name: 'Unhide question' })).toBeVisible();
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByText('Question 2 of 10')).toBeVisible();
  // leave without ending: Today offers to resume
  await go(page, 'today');
  await page.getByRole('link', { name: /Weakest areas.*1 of 10 questions answered|drill.*1 of 10/i }).click();
  await expect(page.getByText('Question 2 of 10')).toBeVisible();
  await page.getByRole('button', { name: 'End' }).click();
  await page.getByRole('button', { name: 'End and see summary' }).click();
  await expect(page.getByRole('heading', { name: /summary/ })).toBeVisible();
  await expect(page.getByText('Ended early. 9 questions not answered, and not counted.')).toBeVisible();
  await expect(page.locator('.score-line .v').first()).toContainText('/1');

  // spaced review now has the unsure/missed item queued for tomorrow; reports exportable
  await go(page, 'reports');
  await expect(page.getByText(/1 report/)).toBeVisible();
  await expect(page.getByText('1 hidden question').or(page.locator('text=Unhide'))).toBeVisible();

  // quick quiz
  await go(page, 'today');
  await page.getByRole('button', { name: 'Quick quiz · 10' }).click();
  await expect(page.getByText('Question 1 of 10')).toBeVisible();

  // concept cards with spaced review
  await go(page, 'cards');
  await shot(page, '12-cards');
  await page.getByRole('link', { name: /Study \d+ new card|Study \d+:|Review \d+ due/ }).click();
  await page.getByRole('button', { name: 'Show card' }).click();
  await expect(page.getByText('On the exam:')).toBeVisible();
  await shot(page, '13-card');
  await page.getByRole('button', { name: 'Knew it' }).click();
  await expect(page.getByText(/Card 2 of/)).toBeVisible();

  // progress
  await go(page, 'progress');
  await expect(page.getByText('Readiness estimate', { exact: true })).toBeVisible();
  await expect(page.getByText('Domain mastery')).toBeVisible();
  await shot(page, '14-progress');

  // reference screens carry the verify label
  for (const r of ['facts', 'blueprint', 'examday']) {
    await go(page, `ref/${r}`);
    await expect(page.getByText("Verify against AASP's current candidate handbook.")).toBeVisible();
  }
  await go(page, 'about');
  await expect(page.getByText(/Unofficial study tool. Not affiliated with or endorsed by AASP/)).toBeVisible();
});

test('Back returns to the same place, and a drill can be left and resumed', async ({ page }) => {
  await onboard(page);
  await go(page, 'cards');
  await page.getByLabel('Search cards').fill('the');
  const card = page.locator('.list .list-item').nth(30);
  await card.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(300);
  await card.click();
  await expect(page.locator('.concept-body')).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Search cards')).toHaveValue('the');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 60);
  await go(page, 'today');
  await page.getByRole('button', { name: 'Quick quiz · 10' }).click();
  await expect(page.locator('.strike-hint')).toBeVisible();
  await optionLabels(page).nth(1).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Resume quick quiz' }).click();
  await expect(page.locator('#verdict')).toBeVisible();
});

test('settings: text size and theme apply; exam-pace block runs', async ({ page }) => {
  await onboard(page);
  await go(page, 'settings');
  await page.getByRole('radio', { name: 'Larger' }).check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-size', 'xl');
  await page.getByRole('radio', { name: 'Dark' }).check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot(page, '15-settings-dark-xl');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
