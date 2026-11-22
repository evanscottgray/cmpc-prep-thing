// Generates content/allocation.json: exactly which (pool, domain, kg, scored) slots each writer file must fill.
import fs from 'node:fs';
const bp = JSON.parse(fs.readFileSync('content/blueprint.json', 'utf8'));
const extras = { // extra drill items per [kg][domain]
  I: { IV: 5, III: 2, I: 1, II: 1, V: 1 }, G: { III: 3, IV: 3 }, L: { I: 3, IV: 2, VI: 1 },
  A: { I: 1, IV: 1 }, B: { II: 2 }, E: { VI: 2 }, D: { VI: 1, II: 1 },
};
// Added after drafting (separate file): extra Domain V drill items so a drill-only mixed exam can fill its unscored V slots.
const extraFile = { file: 'kg-extra', slots: [{ kg: 'B', domain: 'V', drill: 1 }, { kg: 'F', domain: 'V', drill: 1 }] };
const writers = [
  { file: 'kg-i-a', kgs: ['I'], domains: ['I', 'II', 'III', 'V'] },
  { file: 'kg-i-b', kgs: ['I'], domains: ['IV'] },
  { file: 'kg-g', kgs: ['G'] }, { file: 'kg-l', kgs: ['L'] }, { file: 'kg-a', kgs: ['A'] },
  { file: 'kg-b', kgs: ['B'] }, { file: 'kg-f', kgs: ['F'] }, { file: 'kg-e-m', kgs: ['E', 'M'] },
  { file: 'kg-d-k', kgs: ['D', 'K'] }, { file: 'kg-c-h-j', kgs: ['C', 'H', 'J'] },
];
const out = { _note: 'Slots each writer file must fill. pool A/B = exam forms; drill = drill pool. scored:false = unscored trial item on that form.', writers: [] };
let total = 0;
for (const w of writers) {
  const slots = [];
  for (const kg of w.kgs) for (const d of Object.keys(bp.grid[kg])) {
    if (w.domains && !w.domains.includes(d)) continue;
    const n = bp.grid[kg][d];
    const un = bp.unscoredCells.filter(([dd, kk]) => dd === d && kk === kg).length;
    const ex = extras[kg]?.[d] ?? 0;
    if (n + un + ex === 0) continue;
    slots.push({ kg, domain: d, formA_scored: n, formA_unscored: un, formB_scored: n, formB_unscored: un, drill: n + ex });
  }
  const count = slots.reduce((s, x) => s + x.formA_scored + x.formA_unscored + x.formB_scored + x.formB_unscored + x.drill, 0);
  total += count;
  out.writers.push({ file: `content/items/${w.file}.json`, kgs: w.kgs, total: count, slots });
}
out.writers.push({ file: `content/items/${extraFile.file}.json`, kgs: ['B', 'F'], total: 2, slots: extraFile.slots.map((x) => ({ formA_scored: 0, formA_unscored: 0, formB_scored: 0, formB_unscored: 0, ...x })) });
total += 2;
out.total = total;
fs.writeFileSync('content/allocation.json', JSON.stringify(out, null, 1));
console.log(out.writers.map(w => `${w.file}: ${w.total}`).join('\n'), '\nTOTAL', total);
