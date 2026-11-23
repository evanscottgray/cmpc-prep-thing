import { expect, type Page, test } from '@playwright/test';
import { createRequire } from 'node:module';
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

export const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `test-results/shots/${test.info().project.name}/${name}.png`, fullPage: false });
};

export async function onboard(page: Page, daysOut = 21) {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: /Prepare for the CMPC/ })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Add it to your Home Screen' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue in Safari' }).click();
  const d = new Date(); d.setDate(d.getDate() + daysOut);
  const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Exam date').fill(v);
  await page.getByRole('button', { name: 'Start studying' }).click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

export async function axe(page: Page, label: string) {
  if (!(await page.evaluate(() => !!(window as any).axe))) await page.addScriptTag({ path: AXE });
  const r: { violations: { id: string; impact: string; nodes: { target: string[]; failureSummary: string }[] }[] } = await page.evaluate(() =>
    (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }, resultTypes: ['violations'] }));
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  if (bad.length) console.log(label, JSON.stringify(bad.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + n.failureSummary) })), null, 1));
  expect.soft(bad.map((v) => v.id), `${label}: serious/critical axe violations`).toEqual([]);
  return r.violations.length;
}

export const optionLabels = (page: Page) => page.locator('.opt .opt-main');
export const qnum = async (page: Page) => Number((await page.locator('.qcount').innerText()).match(/Question (\d+)/)![1]);

/** In-app navigation (sets location.hash like a link would). */
export async function go(page: Page, hash: string) {
  await page.evaluate((h) => { location.hash = h; }, hash.startsWith('#') ? hash : `#/${hash}`);
}
