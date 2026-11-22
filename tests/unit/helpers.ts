import fs from 'node:fs';
import { execSync } from 'node:child_process';
import type { Bank } from '../../src/types';
let cached: Bank | null = null;
export function loadBank(): Bank {
  if (cached) return cached;
  if (!fs.existsSync('public/data/bank.json')) execSync('node scripts/build-content.mjs');
  cached = JSON.parse(fs.readFileSync('public/data/bank.json', 'utf8'));
  return cached!;
}
export const cellCounts = (bank: Bank, ids: string[]) => {
  const m: Record<string, number> = {};
  const by = new Map(bank.items.map((i) => [i.id, i]));
  for (const id of ids) { const i = by.get(id)!; m[`${i.kg}|${i.domain}`] = (m[`${i.kg}|${i.domain}`] || 0) + 1; }
  return m;
};
