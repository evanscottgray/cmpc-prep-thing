#!/usr/bin/env node
// Blind check tooling.
//   node scripts/blind-check.mjs make <outDir> [--ids id1,id2] [--per 45] [--options-only]
//     → writes packet-N.json files: stems + shuffled options labelled A–D, no keys, rationales or topics,
//       plus a private key map (keymap.json) used for scoring.
//   node scripts/blind-check.mjs score <outDir> [--keymap <path>]
//     → reads answers-N.json ([{id, answer:"A"-"D", confidence:1-5, note}]) and reports agreement,
//       disagreements and low-confidence items (confidence ≤ 2). Writes report.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [cmd, dir] = process.argv.slice(2);
const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const items = fs.readdirSync('content/items').filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(fs.readFileSync(`content/items/${f}`, 'utf8')));
const L = ['A', 'B', 'C', 'D'];

if (cmd === 'make') {
  fs.mkdirSync(dir, { recursive: true });
  const only = arg('--ids')?.split(',');
  const per = Number(arg('--per') || 45);
  let list = only ? items.filter((i) => only.includes(i.id)) : items.slice();
  // deterministic shuffle so packets mix knowledge groups
  const h = (s) => crypto.createHash('sha1').update(s).digest('hex');
  const salt = arg('--salt') || 'blind';
  list.sort((a, b) => h(a.id + salt).localeCompare(h(b.id + salt)));
  const keymap = {};
  const packets = [];
  for (let p = 0; p * per < list.length; p++) packets.push(list.slice(p * per, (p + 1) * per));
  packets.forEach((pk, n) => {
    const out = pk.map((it) => {
      const order = [0, 1, 2, 3].sort((a, b) => h(it.id + salt + a).localeCompare(h(it.id + salt + b)));
      keymap[it.id] = { order, key: L[order.indexOf(it.answer)] };
      if (process.argv.includes('--options-only')) return { id: it.id, options: Object.fromEntries(order.map((o, d) => [L[d], it.options[o]])) };
      return { id: it.id, stem: it.stem, options: Object.fromEntries(order.map((o, d) => [L[d], it.options[o]])) };
    });
    fs.writeFileSync(path.join(dir, `packet-${n + 1}.json`), JSON.stringify(out, null, 1));
  });
  fs.writeFileSync(path.join(dir, 'keymap.json'), JSON.stringify(keymap));
  console.log(`${list.length} items → ${packets.length} packets in ${dir}`);
} else if (cmd === 'score') {
  const keymap = JSON.parse(fs.readFileSync(arg('--keymap') || path.join(dir, 'keymap.json'), 'utf8'));
  const answers = fs.readdirSync(dir).filter((f) => /^answers-\d+\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const byId = new Map(answers.map((a) => [a.id, a]));
  const missing = Object.keys(keymap).filter((id) => !byId.has(id));
  const disagree = [], low = [];
  let agree = 0;
  for (const [id, k] of Object.entries(keymap)) {
    const a = byId.get(id); if (!a) continue;
    if (String(a.answer).trim().toUpperCase() === k.key) agree++; else disagree.push({ id, blind: a.answer, key: k.key, confidence: a.confidence, note: a.note });
    if (Number(a.confidence) <= 2) low.push({ id, blind: a.answer, key: k.key, confidence: a.confidence, note: a.note });
  }
  const answered = Object.keys(keymap).length - missing.length;
  const report = { items: Object.keys(keymap).length, answered, agree, agreementPct: +(100 * agree / Math.max(1, answered)).toFixed(1), disagree, lowConfidence: low, missing };
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 1));
  console.log(`answered ${answered}/${report.items}; agreement ${report.agreementPct}% (${agree}); disagreements ${disagree.length}; low-confidence ${low.length}; missing ${missing.length}`);
} else {
  console.log('usage: blind-check.mjs make|score <dir>');
}
