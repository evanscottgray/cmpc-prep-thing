import { test, expect, type Page } from '@playwright/test';
import { onboard, optionLabels, go } from './helpers';

/** Index of the right option on screen, found by matching the shown options against the bank. */
async function keyIndex(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const bank = await (await fetch('./data/bank.json')).json();
    const shown = [...document.querySelectorAll('.opt .otext')].map((e) => (e.lastChild?.textContent ?? '').trim());
    const item = bank.items.find((i: any) => shown.every((t) => i.options.includes(t)));
    return shown.indexOf(item.options[item.answer]);
  });
}
const confetti = (page: Page) => page.locator('canvas.confetti');
async function answer(page: Page, right: boolean) {
  const k = await keyIndex(page);
  await optionLabels(page).nth(right ? k : (k + 1) % 4).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.locator('#verdict')).toContainText(right ? 'Correct' : 'Incorrect');
}
async function startQuiz(page: Page) {
  await page.getByRole('button', { name: 'Quick quiz · 10', exact: true }).click();
  await expect(page.getByText('Question 1 of 10')).toBeVisible();
}

test('a right answer throws confetti; a wrong one, Calm, and Reduce Motion do not', async ({ page }) => {
  await onboard(page);
  await startQuiz(page);
  await answer(page, true);
  await expect(confetti(page)).toHaveCount(1);
  await expect(confetti(page)).toHaveCount(0, { timeout: 6000 }); // cleans itself up
  await page.getByRole('button', { name: 'Next question' }).click();
  await answer(page, false);
  await page.waitForTimeout(700);
  await expect(confetti(page)).toHaveCount(0);

  // three in a row shows the streak chip
  for (let q = 3; q <= 5; q++) {
    await page.getByRole('button', { name: 'Next question' }).click();
    await expect(page.getByText(`Question ${q} of 10`)).toBeVisible();
    await answer(page, true);
  }
  await expect(page.locator('#verdict')).toContainText("That's 3 in a row!"); // announced with the verdict, so Calm and VoiceOver get it too
  await expect(page.locator('.streak-chip')).toHaveCount(0); // said once: the verdict carries it on the milestone itself
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(confetti(page)).toHaveCount(0); // a new question isn't read through old confetti
  await expect(page.locator('.streak-chip')).toContainText('3 in a row');
  await answer(page, false);
  await expect(page.locator('#verdict')).toContainText('This one comes back in spaced review.');
  await expect(page.getByText('Best run: 3')).toBeVisible(); // a miss keeps the run you had

  // Calm: same feedback, no confetti
  await go(page, 'settings');
  await page.getByRole('radio', { name: 'Calm' }).check({ force: true });
  await expect(page.locator('html')).toHaveAttribute('data-calm', '');
  await page.goBack();
  await page.getByRole('button', { name: 'Next question' }).click();
  await answer(page, true);
  await page.waitForTimeout(700);
  await expect(confetti(page)).toHaveCount(0);
});

test('Reduce Motion on the device means no confetti, even with Celebrations on', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await onboard(page);
  await startQuiz(page);
  await answer(page, true);
  await page.waitForTimeout(700);
  await expect(confetti(page)).toHaveCount(0);
});

test('reaching the daily goal is celebrated once, and a timed session shows no confetti', async ({ page }) => {
  await onboard(page);
  await go(page, 'settings');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Decrease daily study target' }).click();
  await expect(page.getByRole('group', { name: 'daily study target' })).toContainText('10 questions');
  await go(page, 'today');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await startQuiz(page);
  for (let q = 1; q <= 10; q++) {
    if (q > 1) { await page.getByRole('button', { name: 'Next question' }).click(); await expect(page.getByText(`Question ${q} of 10`)).toBeVisible(); }
    await answer(page, q % 2 === 1);
  }
  // The 10th answer is wrong but reaches the goal: a green note of its own, never confetti over a miss.
  await expect(page.locator('.goal-note')).toContainText('Daily goal reached: 10 today.');
  await page.waitForTimeout(700);
  await expect(confetti(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'See summary' }).click();
  await expect(page.getByText('Good practice')).toBeVisible(); // 5 of 10: encouragement, no confetti needed
  await expect(page.getByText('This session reached your goal')).toBeVisible();
  await expect(page.getByRole('button', { name: 'If you want more: another quick quiz' })).toBeVisible(); // optional once the goal is met
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.locator('.goal-done')).toContainText('Daily goal reached'); // the day's win leads Today
  await expect(page.getByText('Day 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Next, when you have 90 minutes' })).toBeVisible(); // the exam can wait for a fresh day
  await expect(page.locator('.week')).toHaveCount(0); // Day 1: the line says it; no strip with a lone dot

  // reopening the app the same day doesn't celebrate again
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await page.waitForTimeout(800);
  await expect(confetti(page)).toHaveCount(0);

  // timed: no feedback, no confetti
  await go(page, 'start/block');
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByText(/Question 1 of 23|1 of 23/)).toBeVisible();
  await optionLabels(page).nth(await keyIndex(page)).click();
  await page.waitForTimeout(700);
  await expect(confetti(page)).toHaveCount(0);

  // goal already met, a timed session running: Today puts Resume above the green card
  await go(page, 'today');
  const resume = page.locator('.card.hero', { hasText: 'Resume' });
  await expect(resume).toBeVisible();
  const [r, d] = [await resume.boundingBox(), await page.locator('.card.daily').boundingBox()];
  expect(r!.y).toBeLessThan(d!.y);
});

test('moving on straight away cancels a celebration that has not started yet', async ({ page }) => {
  await onboard(page);
  await startQuiz(page);
  await answer(page, true);
  await page.getByRole('button', { name: 'Next question' }).click(); // before the verdict's burst (it waits for the pop to settle)
  await expect(page.getByText('Question 2 of 10')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(confetti(page)).toHaveCount(0);
});

test('a strong session ends with confetti on its summary (once)', async ({ page }) => {
  await onboard(page);
  await startQuiz(page);
  for (let q = 1; q <= 10; q++) {
    if (q > 1) { await page.getByRole('button', { name: 'Next question' }).click(); await expect(page.getByText(`Question ${q} of 10`)).toBeVisible(); }
    await answer(page, q !== 4); // 9 of 10
  }
  await page.getByRole('button', { name: 'See summary' }).click();
  await expect(page.getByText('Excellent work!')).toBeVisible();
  await expect(confetti(page)).toHaveCount(1);
  await expect(confetti(page)).toHaveCount(0, { timeout: 6000 });
  await page.getByRole('link', { name: 'Review all 10' }).click();
  await page.goBack();
  await expect(page.getByText('Excellent work!')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(confetti(page)).toHaveCount(0); // not replayed on the way back
});

test('a warm-up left partway stays the main way back on Today', async ({ page }) => {
  await onboard(page);
  await page.getByRole('button', { name: 'Start the warm-up' }).click();
  await answer(page, true);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Your warm-up' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Resume your warm-up · 9 left/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Or take Form A now · 90 minutes' })).toBeVisible();
});

test('reading every miss of a timed set, in any order, ends with "Finish review" and its own moment', async ({ page }) => {
  await onboard(page);
  await go(page, 'start/block');
  await page.getByRole('button', { name: 'Start Exam-pace block' }).click();
  for (let q = 1; q <= 23; q++) {
    const k = await keyIndex(page);
    await optionLabels(page).nth(q <= 2 ? (k + 1) % 4 : k).click(); // two misses
    await page.getByRole('button', { name: q < 23 ? 'Next' : 'Finish' }).click();
  }
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('link', { name: 'Review 2 misses' }).click();
  // out of order: the second miss first, back to the list, then the first
  await page.locator('.list .list-item').nth(1).click();
  await expect(page.getByText('1 of 2 read')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next unread miss' })).toBeVisible(); // the last row, with one still unread: on to it, not back to the list
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.list .list-item').nth(1).locator('.status-ic.read')).toHaveCount(1); // read: checked off
  await expect(page.locator('.list .list-item').first().locator('.status-ic.skip')).toHaveCount(1); // not yet
  // an interrupted block review waits on Today, and picks up at the unread miss
  await go(page, 'today');
  await page.getByRole('link', { name: /Exam-pace block review/ }).click();
  await expect(page.getByText('2 of 2 read')).toBeVisible();
  await page.getByRole('button', { name: 'Finish review' }).click(); // offered on whichever miss completes the set
  await expect(page.getByText('Both misses read')).toBeVisible();
  await expect(confetti(page)).toHaveCount(1);
  await expect(page.locator('.result-actions > :first-child')).toHaveText('Done'); // Done leads now
  await expect(page.getByRole('link', { name: 'If you want: read the 2 misses again' })).toBeVisible();
});

test('with every miss opened but not finished, Results finishes the review in one tap', async ({ page }) => {
  await onboard(page);
  await go(page, 'start/block');
  await page.getByRole('button', { name: 'Start Exam-pace block' }).click();
  for (let q = 1; q <= 23; q++) {
    const k = await keyIndex(page);
    await optionLabels(page).nth(q <= 2 ? (k + 1) % 4 : k).click();
    await page.getByRole('button', { name: q < 23 ? 'Next' : 'Finish' }).click();
  }
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Session summary' })).toBeVisible();
  const results = new URL(page.url()).hash;
  await page.getByRole('link', { name: 'Review 2 misses' }).click();
  for (const i of [0, 1]) { await page.locator('.list .list-item').nth(i).click(); await page.getByRole('button', { name: 'Back', exact: true }).click(); } // both opened, then left
  await expect(page).toHaveURL(/#\/review\/[^/?]+\?f=incorrect$/); // back on the list before moving on
  await expect(page.getByRole('button', { name: 'Finish review' })).toBeFocused(); // the list can finish it too, and that's where you land
  await go(page, results);
  await page.getByRole('button', { name: 'Finish review' }).click(); // no detour back into a question
  await expect(page.getByText('Both misses read')).toBeVisible();
  await expect(page.locator('#review-done')).toBeFocused(); // seen and heard, not left below the fold
  const [done, hero] = [await page.locator('#review-done').boundingBox(), await page.locator('.card.hero').boundingBox()];
  expect(done!.y).toBeLessThan(hero!.y); // the moment leads, with Done right under it
  await expect(page.locator('.cheer')).toHaveCount(0); // one celebration on the screen
  await expect(confetti(page)).toHaveCount(1);
});

test('started block reviews stay on Today: the latest three, then "Show 1 more review"', async ({ page }) => {
  test.setTimeout(180000);
  await onboard(page);
  for (let b = 0; b < 4; b++) {
    await go(page, 'start/block');
    await page.getByRole('button', { name: 'Start Exam-pace block' }).click();
    for (let q = 1; q <= 23; q++) {
      const k = await keyIndex(page);
      await optionLabels(page).nth(q === 1 ? (k + 1) % 4 : k).click();
      await page.getByRole('button', { name: q < 23 ? 'Next' : 'Finish' }).click();
    }
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await page.getByRole('link', { name: 'Review 1 miss' }).click();
    await page.locator('.list .list-item').first().click(); // started, not finished
    await expect(page.getByText('1 of 1 read')).toBeVisible();
  }
  await go(page, 'today');
  const rows = page.locator('.list-pair .li-title', { hasText: 'Exam-pace block review' });
  await expect(rows).toHaveCount(3);
  await page.getByRole('button', { name: 'Show 1 more review' }).click();
  await expect(rows).toHaveCount(4);
});
