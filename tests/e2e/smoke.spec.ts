import { test, expect } from '@playwright/test';
test('loads and onboards', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Prepare for the CMPC/ })).toBeVisible();
  await page.screenshot({ path: `test-results/shots/smoke-${test.info().project.name}.png` });
});
