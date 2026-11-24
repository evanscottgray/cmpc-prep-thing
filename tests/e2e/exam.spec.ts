import { test, expect } from '@playwright/test';
import { onboard, optionLabels, shot, qnum, go } from './helpers';

test('full exam flow: answer, strike, flag, navigator, exact resume, rotation, end, results, review', async ({ page }) => {
  await onboard(page);
  await shot(page, '01-today');
  await expect(page.getByRole('heading', { name: 'Warm up with 10 untimed questions' })).toBeVisible(); // first visit: an untimed warm-up leads
  await page.getByRole('button', { name: 'Or take Form A now · 90 minutes' }).click();
  await expect(page.getByRole('heading', { name: 'Form A', level: 1 })).toBeVisible();
  await shot(page, '02-exam-intro');
  await page.getByRole('button', { name: 'Start Form A' }).click();

  // Q1: choose the second option
  await expect(page.locator('.qcount')).toContainText('Question 1');
  await optionLabels(page).nth(1).click();
  await expect(page.locator('.opt').nth(1)).toHaveClass(/selected/);
  await shot(page, '03-exam-q1');
  await page.getByRole('button', { name: /^(Next|Skip)/ }).click();

  // Q2: strike option A, flag, answer option D
  await expect(page.locator('.qcount')).toContainText('Question 2');
  await page.getByRole('button', { name: 'Strike out option A' }).click();
  await expect(page.locator('.opt').nth(0)).toHaveClass(/struck/);
  await page.getByRole('button', { name: 'Flag for review' }).click();
  await expect(page.getByRole('button', { name: 'Flag for review' })).toHaveAttribute('aria-pressed', 'true');
  await optionLabels(page).nth(3).click();
  await page.getByRole('button', { name: /^(Next|Skip)/ }).click();
  await page.getByRole('button', { name: /^(Next|Skip)/ }).click();
  await expect(page.locator('.qcount')).toContainText('Question 4');

  // No feedback during the exam
  await expect(page.getByText(/Correct|Incorrect/)).toHaveCount(0);

  // Navigator
  await page.getByRole('button', { name: /^Navigator/ }).click();
  await expect(page.getByRole('dialog', { name: 'Navigator' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Question 1: answered' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Question 2: answered, flagged' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Question 3: unanswered' })).toBeVisible();
  await shot(page, '04-navigator');
  await page.getByRole('button', { name: 'Flagged 1', exact: true }).click();
  await expect(page.locator('.nav-cell')).toHaveCount(1);
  await page.locator('.nav-cell').first().click();
  await expect(page.locator('.qcount')).toContainText('Question 2');

  // Exact resume after reload
  const timerBefore = await page.locator('.timer').innerText();
  const stemBefore = await page.locator('#q-stem').textContent();
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('.qcount')).toContainText('Question 2');
  await expect(page.locator('#q-stem')).toHaveText(stemBefore!);
  await expect(page.locator('.opt').nth(0)).toHaveClass(/struck/);
  await expect(page.locator('.opt').nth(3)).toHaveClass(/selected/);
  await expect(page.getByRole('button', { name: 'Flag for review', pressed: true })).toBeVisible();
  const timerAfter = await page.locator('.timer').innerText();
  expect(timerAfter).not.toBe(timerBefore); // wall clock kept running

  // Rotation keeps state
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect(page.locator('.qcount')).toContainText('Question 2');
  await expect(page.locator('.opt').nth(3)).toHaveClass(/selected/);
  await shot(page, '05-exam-rotated');
  await page.setViewportSize(vp);

  // Leave and resume from Today
  await page.getByRole('button', { name: 'Exam menu' }).click();
  await page.getByRole('button', { name: /Leave exam screen/ }).click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByRole('heading', { name: /Resume Form A/ })).toBeVisible();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.qcount')).toContainText('Question 2');

  // End with confirmation
  await page.getByRole('button', { name: /^Navigator/ }).click();
  await page.getByRole('button', { name: 'End exam…' }).click();
  const confirm = page.getByRole('dialog', { name: 'End the exam?' });
  await expect(confirm).toContainText('113 unanswered');
  await shot(page, '06-end-confirm');
  await page.getByRole('button', { name: 'Keep working' }).click();
  await expect(confirm).toHaveCount(0);
  await page.getByRole('button', { name: /^Navigator/ }).click();
  await page.getByRole('button', { name: 'End exam…' }).click();
  await page.getByRole('button', { name: 'End exam and score' }).click();

  // Results
  await expect(page.getByRole('heading', { name: 'Form A results' })).toBeVisible();
  await expect(page.getByText('Did not pass (estimated)')).toBeVisible();
  await expect(page.getByText('Estimated scaled score (550 passes)')).toBeVisible();
  await expect(page.getByText(/This score is an estimate/)).toBeVisible();
  await expect(page.getByText('Percent correct by domain')).toBeVisible();
  await shot(page, '07-results');
  // a score bar opens only the scored questions behind it, and trial items can be added back
  await page.locator('a.bar-row').first().click();
  await expect(page.getByText('Scored questions only')).toBeVisible();
  const scoredOnly = await page.locator('.list .list-item').count();
  await expect(page.locator('.list .list-item', { hasText: 'Unscored' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Include trial questions' }).click();
  await expect(page.getByText('Scored questions only')).toHaveCount(0);
  expect(await page.locator('.list .list-item').count()).toBeGreaterThanOrEqual(scoredOnly);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Form A results' })).toBeVisible();

  // Review with filters
  await page.getByRole('link', { name: 'Review all 115' }).click();
  await expect(page.getByText('115 questions')).toBeVisible();
  await page.getByRole('button', { name: 'Flagged 1', exact: true }).click();
  await expect(page.getByText('1 question', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Unscored' }).click();
  await expect(page.getByText('15 questions')).toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByText('Filter by domain or group').click();
  await page.getByLabel('Domain').selectOption('IV');
  const row = page.locator('.list .list-item').nth(8);
  const rowId = await row.getAttribute('id');
  await row.click();
  await expect(page.locator('.q-meta')).toContainText('Domain IV');
  await expect(page.getByText('Takeaway:')).toBeVisible();
  await expect(page.getByText('Correct answer')).toBeVisible();
  await expect(page.locator('.rationale')).toHaveCount(4);
  await shot(page, '08-review-item');
  // back to the list: same filter, same place
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator(`#${rowId}`)).toBeInViewport();
  await page.getByRole('button', { name: 'Back' }).click(); // one Back from the list returns to results, not the list again
  await expect(page.getByRole('heading', { name: 'Form A results' })).toBeVisible();
  // a question opened from the list, left with the browser's Back, then reopened from elsewhere: Back goes to the list
  await page.getByRole('link', { name: 'Review all 115' }).click();
  const listHash = await page.evaluate(() => location.hash);
  await page.locator('.list .list-item').nth(2).click();
  await expect(page.locator('.q-meta')).toBeVisible();
  const itemHash = await page.evaluate(() => location.hash);
  await page.goBack();
  await expect(page.getByRole('heading', { name: /^Review/ })).toBeVisible();
  await go(page, 'today');
  await go(page, itemHash);
  await expect(page.locator('.q-meta')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: /^Review · / })).toBeVisible(); // the list, not Today
  await go(page, 'results/' + listHash.split('/')[2]);

  // past exams stay reachable from Progress
  await go(page, 'progress');
  await page.getByRole('link', { name: /Form A/ }).click();
  await expect(page.getByRole('heading', { name: 'Form A results' })).toBeVisible();

  // Retake labelled
  await go(page, 'start/formA');
  await expect(page.getByText(/not a fresh estimate/)).toBeVisible();
});

test('timer auto-submits at zero even after the app was closed', async ({ page, context }) => {
  await page.clock.install();
  await onboard(page);
  await go(page, 'start/formB');
  await expect(page.getByRole('heading', { name: 'Form B', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Start Form B' }).click();
  await optionLabels(page).nth(0).click();
  await expect(page.locator('.timer')).toContainText('1:29:');
  // "close" the app: open a blank page, advance the wall clock past 90 minutes, come back
  await page.goto('about:blank');
  await page.clock.fastForward('01:31:00');
  await page.goto('./#/today');
  await expect(page.getByRole('dialog', { name: "Time's up" })).toBeVisible();
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByRole('heading', { name: /Form B results/ })).toBeVisible();
  await expect(page.getByText(/Time ran out/)).toBeVisible();
});

test('keyboard: arrows stay with a focused answer, nothing moves while paused, and the safe choice is focused', async ({ page }) => {
  await onboard(page);
  await go(page, 'start/block');
  await page.getByRole('radio', { name: 'Coached' }).check({ force: true });
  await page.getByRole('button', { name: 'Start Exam-pace block' }).click();
  await optionLabels(page).nth(0).click();
  await page.locator('.opt input').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.qcount')).toContainText('Question 1');
  await page.locator('#q-stem').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.qcount')).toContainText('Question 2');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#resume-btn')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+Tab'); // focus stays on the cover
  await expect(page.getByRole('button', { name: 'Leave exam screen' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#resume-btn')).toBeFocused();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.qcount')).toContainText('Question 2');
  await expect(page.locator('#pause-btn')).toBeFocused();
  await page.getByRole('button', { name: 'Exam menu' }).click();
  await page.getByRole('button', { name: 'Submit now' }).click();
  await expect(page.getByRole('button', { name: 'Keep working' })).toBeFocused();
  await page.getByRole('button', { name: 'Keep working' }).click();
  // leaving a short timed session: Today offers to resume it
  await page.getByRole('button', { name: 'Exam menu' }).click();
  await page.getByRole('button', { name: /Leave exam screen/ }).click();
  await page.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByRole('heading', { name: 'Resume Exam-pace block' })).toBeVisible();
});

test('time running out replaces an open confirmation, and the navigator keeps its controls in view', async ({ page }) => {
  await page.clock.install();
  await onboard(page);
  await go(page, 'start/mixed');
  await page.getByRole('button', { name: 'Start Mixed exam' }).click();
  await page.getByRole('button', { name: /^Navigator/ }).click();
  await page.locator('.nav-cell').nth(112).click();
  await page.getByRole('button', { name: /^Navigator/ }).click();
  await expect(page.locator('.nav-cell.current')).toBeInViewport();
  await page.locator('.nav-cell.current').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /^Question 114:/ })).toBeFocused();
  expect(await page.locator('.nav-cell[tabindex="0"]').count()).toBe(1);
  await expect(page.getByRole('button', { name: 'Unanswered 115' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Close' })).toBeInViewport();
  await page.getByRole('button', { name: 'End exam…' }).click();
  await expect(page.getByRole('dialog', { name: 'End the exam?' })).toBeVisible();
  await page.clock.fastForward('01:31:00');
  await expect(page.getByRole('dialog', { name: "Time's up" })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'See results' })).toBeFocused();
});

test('an exam left running expires while Today stays open', async ({ page }) => {
  await page.clock.install();
  await onboard(page);
  await go(page, 'start/block');
  await page.getByRole('button', { name: 'Start Exam-pace block' }).click();
  await optionLabels(page).nth(0).click();
  await go(page, 'today');
  await expect(page.getByRole('heading', { name: 'Resume Exam-pace block' })).toBeVisible();
  await page.clock.fastForward('18:30');
  await expect(page.getByRole('dialog', { name: "Time's up" })).toBeVisible();
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByRole('heading', { name: /summary/ })).toBeVisible();
});

test('timer auto-submits while open, and coached mode can pause', async ({ page }) => {
  await page.clock.install();
  await onboard(page);
  await go(page, 'start/block');
  await expect(page.getByRole('heading', { name: 'Exam-pace block', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'Coached' }).check({ force: true });
  await page.getByRole('button', { name: 'Start Exam-pace block' }).click();
  await expect(page.locator('.exam-pace')).toContainText('47 s per question');
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await expect(page.locator('.paused-cover')).toContainText('18:00 remaining');
  await page.clock.fastForward('05:00');
  await expect(page.locator('.paused-cover')).toContainText('18:00 remaining');
  // leaving from the pause cover keeps the exam paused
  await page.getByRole('button', { name: 'Leave exam screen' }).click();
  await expect(page.getByRole('heading', { name: /Resume Exam-pace block/ })).toBeVisible();
  await page.clock.fastForward('05:00');
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(page.locator('.paused-cover')).toContainText('18:00 remaining');
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.clock.fastForward('18:30');
  await expect(page.getByRole('dialog', { name: "Time's up" })).toBeVisible();
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByRole('heading', { name: /summary/ })).toBeVisible();
});
