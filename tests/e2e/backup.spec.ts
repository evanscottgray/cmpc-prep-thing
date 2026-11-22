import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { onboard, optionLabels, go } from './helpers';

test('backup downloads and restores exactly into a fresh profile', async ({ page, browser }) => {
  await onboard(page);
  // make some progress
  await page.getByRole('button', { name: 'Quick quiz · 10' }).click();
  for (let i = 0; i < 3; i++) {
    await optionLabels(page).nth(i % 4).click();
    await page.getByRole('button', { name: 'Check answer' }).click();
    await page.getByRole('button', { name: 'Next item' }).click();
  }
  await go(page, 'backup');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Back up now/ }).click()]);
  const file = test.info().outputPath('backup.json');
  await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(backup.app).toBe('cmpc-prep');
  expect(backup.state.attempts).toHaveLength(3);

  // restore into a brand-new context (separate storage, like a different address)
  const ctx2 = await browser.newContext({ viewport: page.viewportSize()! });
  const p2 = await ctx2.newPage();
  await p2.goto(page.url().replace(/#.*$/, '#/onboarding'));
  await p2.getByRole('link', { name: /Restore from a backup/ }).click();
  await p2.locator('#restore-file').setInputFiles(file);
  await expect(p2.getByRole('dialog', { name: 'Restore this backup?' })).toContainText('3 answers');
  await p2.getByRole('button', { name: 'Replace and restore' }).click();
  await expect(p2.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

  // export again from the restored profile and compare state exactly
  await go(p2, 'backup');
  const [dl2] = await Promise.all([p2.waitForEvent('download'), p2.getByRole('button', { name: /Back up now/ }).click()]);
  const file2 = test.info().outputPath('backup2.json');
  await dl2.saveAs(file2);
  const again = JSON.parse(fs.readFileSync(file2, 'utf8'));
  expect(again.state.attempts).toEqual(backup.state.attempts);
  expect(again.state.sessions).toEqual(backup.state.sessions);
  expect(again.state.srs).toEqual(backup.state.srs);
  expect({ ...again.state.settings, lastBackupAt: 0 }).toEqual({ ...backup.state.settings, lastBackupAt: 0 });

  // progress survives reload
  await p2.reload();
  await go(p2, 'progress');
  await expect(p2.getByText('Total answers')).toBeVisible();
  await expect(p2.locator('.stat', { hasText: 'Total answers' }).locator('.v')).toHaveText('3');
  await ctx2.close();

  // bad file is rejected with an in-app dialog
  const bad = test.info().outputPath('bad.json'); fs.writeFileSync(bad, '{"hello":1}');
  await page.locator('#restore-file').setInputFiles(bad);
  await expect(page.getByRole('dialog', { name: "Can't restore that file" })).toBeVisible();
});
