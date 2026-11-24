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
  await page.getByRole('button', { name: 'Quick quiz · 10' }).click();
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
  await expect(page.getByText('🔥 3 in a row')).toBeVisible();
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(confetti(page)).toHaveCount(0); // a new question isn't read through old confetti
  await answer(page, false);
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
    await answer(page, q % 2 === 0);
  }
  await expect(page.locator('#verdict')).toContainText('Daily goal reached: 10 today.'); // inline, not a toast over the question
  await expect(confetti(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'See summary' }).click();
  await expect(page.getByText('Good practice')).toBeVisible(); // 5 of 10: encouragement, no confetti needed
  await expect(page.getByText('Daily goal reached: 10 today.')).toBeVisible();
  await page.getByRole('link', { name: 'Done' }).click();
  await expect(page.getByText('🎉 Daily goal reached')).toBeVisible();
  await expect(page.getByText('1 of the last 7 days')).toBeVisible();
  await expect(page.getByText('Next, when you have 90 minutes')).toBeVisible(); // the exam can wait for a fresh day

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
});
