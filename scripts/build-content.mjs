#!/usr/bin/env node
// Compiles content/ into public/data/bank.json (the single runtime content file the app fetches).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const list = (d) => fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.json')).sort() : [];

const items = list('content/items').flatMap((f) => rd(`content/items/${f}`));
const cards = list('content/cards').flatMap((f) => rd(`content/cards/${f}`));
const bp = rd('content/blueprint.json');
const refs = rd('content/references.json').refs;

items.sort((a, b) => a.id.localeCompare(b.id));
const KG_ORDER = bp.kgs.map((k) => k.id);
cards.sort((a, b) => KG_ORDER.indexOf(a.kg) - KG_ORDER.indexOf(b.kg) || (a.category ? 0 : 1) - (b.category ? 0 : 1) || 0);

const usedRefs = new Set([...items.flatMap((i) => i.refs), ...cards.flatMap((c) => c.refs || [])]);
const refOut = Object.fromEntries(Object.entries(refs).filter(([k]) => usedRefs.has(k)).map(([k, v]) => [k, { s: v.short, c: v.citation }]));

const body = {
  blueprint: { domains: bp.domains, kgs: bp.kgs, grid: bp.grid, unscoredPerForm: bp.unscoredPerForm, exam: bp.exam },
  items: items.map((i) => ({
    id: i.id, pool: i.pool, scored: i.scored, domain: i.domain, kg: i.kg, topic: i.topic,
    cog: i.cognitive, diff: i.difficulty, fmt: i.format, ctx: i.context,
    stem: i.stem, options: i.options, answer: i.answer, rationales: i.rationales, takeaway: i.takeaway, refs: i.refs,
  })),
  cards: cards.map(({ _file, ...c }) => c),
  refs: refOut,
};
const json = JSON.stringify(body);
const version = crypto.createHash('sha256').update(json).digest('hex').slice(0, 12);
fs.mkdirSync(path.join(ROOT, 'public/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/data/bank.json'), JSON.stringify({ version, ...body }));
console.log(`bank.json: ${items.length} items, ${cards.length} cards, ${Object.keys(refOut).length} refs, version ${version}, ${(json.length / 1024).toFixed(0)} KB`);
