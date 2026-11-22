#!/usr/bin/env node
// Validates the question bank and concept cards.
// Usage:
//   node scripts/validate-bank.mjs                 # whole bank + cards, writes docs/content-stats.json
//   node scripts/validate-bank.mjs --file content/items/kg-g.json   # one item file vs its allocation
//   node scripts/validate-bank.mjs --cards content/cards/x.json     # one card file
// Exit code 1 on any error. Warnings never fail the run.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const bp = rd('content/blueprint.json');
const refs = rd('content/references.json').refs;
const alloc = rd('content/allocation.json');

const DOMAINS = bp.domains.map((d) => d.id);
const KGS = bp.kgs.map((k) => k.id);
const ENUM = {
  pool: ['A', 'B', 'drill'],
  cognitive: ['recall', 'application', 'analysis'],
  difficulty: [1, 2, 3],
  format: ['vignette', 'direct'],
  setting: ['team-sport', 'individual-sport', 'para-sport', 'performing-arts', 'tactical', 'esports', 'business', 'exercise-health', 'general'],
  level: ['youth', 'adolescent', 'collegiate', 'elite', 'professional', 'masters', 'recreational', 'adult', 'na'],
  delivery: ['individual', 'team', 'organizational', 'virtual', 'na'],
};

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const cardsArg = args.includes('--cards') ? args[args.indexOf('--cards') + 1] : null;
const quiet = args.includes('--quiet');

function loadDir(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}
function loadArray(rel) {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch (e) { err(`${rel}: invalid JSON — ${e.message}`); return []; }
  if (!Array.isArray(data)) { err(`${rel}: top level must be an array`); return []; }
  return data.map((x) => ({ ...x, _file: rel }));
}

// ---------- text helpers ----------
const STOP = new Set('a an the and or of to in on for with at by from is are was were be been it its this that their they them she he her his as into than then which who what when how whose your you our we has have had not no do does did after before during while about over under more most less least very can could should would will may might'.split(' '));
const words = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
function shingles(s, n = 3) {
  const w = words(s); const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
  return set;
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
const HEDGE = /\b(may|might|often|usually|generally|typically|in most cases|tends? to|can be|sometimes|likely)\b/i;
const REFER = /\b(refer|referral|referring)\b/i;
const NEG = /\b(NOT|EXCEPT|LEAST)\b/;
const LETTER_REF = /\b(option|choice|answer|alternative)\s*\(?[A-D]\)?(?![a-z])|\([A-D]\)|\b[A-D]\)\s|\b(first|second|third|fourth|last) (option|choice)\b/;
const ABSOLUTE = /\b(always|never|only|all|every|everyone|entirely|fully|completely|immediately|guarantee\w*|must|nothing|any|regardless|solely|totally|at once|no matter)\b/i;
const COLLAB = /\b(together|collaborat\w*|jointly|with (him|her|them|the (athlete|client|player|players|team|coach|dancer|crew|staff))|explor\w+|consent|agree\w*|invit\w+|ask(s|ing)? (him|her|them|the|what|how|whether)|discuss\w*|her own|his own|their own|co-\w+|check (in )?with)\b/i;
const MULTI = /\bthen\b|, and |;| before | while | plus /i;
/** Heuristic cue flags for one item (test-wiseness patterns found by the options-only check). */
function cueFlags(it) {
  const f = [];
  if (!Array.isArray(it.options) || it.options.length !== 4) return f;
  const k = it.answer, d = it.options.filter((_, i) => i !== k);
  if (!ABSOLUTE.test(it.options[k]) && d.filter((o) => ABSOLUTE.test(o)).length >= 2) f.push('absolutes-only-in-distractors');
  if (COLLAB.test(it.options[k]) && !d.some((o) => COLLAB.test(o))) f.push('collaborative-only-key');
  if (MULTI.test(it.options[k]) && !d.some((o) => MULTI.test(o))) f.push('multistep-only-key');
  return f;
}
const BANNED_OPT = /\b(all|none|both) of the (above|these|options)\b|\b[A-D] and [A-D]\b/i;

// ---------- item validation ----------
function validateItem(it) {
  const where = `${it._file} ${it.id ?? '(no id)'}`;
  const need = ['id', 'pool', 'scored', 'domain', 'kg', 'topic', 'cognitive', 'difficulty', 'format', 'context', 'stem', 'options', 'answer', 'rationales', 'takeaway', 'refs'];
  for (const k of need) if (it[k] === undefined || it[k] === null || it[k] === '') err(`${where}: missing ${k}`);
  if (typeof it.id === 'string') {
    const m = it.id.match(/^([A-M])-(I|II|III|IV|V|VI)-(\d{3})$/);
    if (!m) err(`${where}: id must look like G-III-004`);
    else if (m[1] !== it.kg || m[2] !== it.domain) err(`${where}: id prefix ${m[1]}-${m[2]} doesn't match kg/domain ${it.kg}/${it.domain}`);
  }
  if (!ENUM.pool.includes(it.pool)) err(`${where}: bad pool ${it.pool}`);
  if (typeof it.scored !== 'boolean') err(`${where}: scored must be boolean`);
  if (it.pool === 'drill' && it.scored === false) err(`${where}: drill items must have scored:true`);
  if (!DOMAINS.includes(it.domain)) err(`${where}: bad domain ${it.domain}`);
  if (!KGS.includes(it.kg)) err(`${where}: bad kg ${it.kg}`);
  for (const k of ['cognitive', 'difficulty', 'format']) if (!ENUM[k].includes(it[k])) err(`${where}: bad ${k} ${it[k]}`);
  const c = it.context || {};
  for (const k of ['setting', 'level', 'delivery']) if (!ENUM[k].includes(c[k])) err(`${where}: bad context.${k} ${c[k]}`);
  if (!Array.isArray(it.options) || it.options.length !== 4) err(`${where}: need exactly 4 options`);
  if (!Array.isArray(it.rationales) || it.rationales.length !== 4) err(`${where}: need exactly 4 rationales`);
  if (!Number.isInteger(it.answer) || it.answer < 0 || it.answer > 3) err(`${where}: answer must be 0–3`);
  if (typeof it.stem === 'string') {
    if (!it.stem.trim().endsWith('?')) err(`${where}: stem must end with a direct question ("?")`);
    if (it.stem.length < 40) warn(`${where}: very short stem`);
  }
  if (Array.isArray(it.options)) {
    const norm = it.options.map((o) => String(o).trim().toLowerCase());
    if (new Set(norm).size !== norm.length) err(`${where}: duplicate options`);
    it.options.forEach((o, i) => {
      if (typeof o !== 'string' || !o.trim()) err(`${where}: empty option ${i}`);
      else if (BANNED_OPT.test(o)) err(`${where}: banned option pattern in "${o.slice(0, 50)}"`);
    });
  }
  if (Array.isArray(it.rationales)) it.rationales.forEach((r, i) => {
    if (typeof r !== 'string' || r.trim().length < 15) err(`${where}: rationale ${i} missing/too short`);
    else if (LETTER_REF.test(r)) err(`${where}: rationale ${i} refers to an option letter/position: "${r.match(LETTER_REF)[0]}"`);
  });
  if (typeof it.takeaway === 'string' && LETTER_REF.test(it.takeaway)) err(`${where}: takeaway refers to an option letter`);
  if (!Array.isArray(it.refs) || it.refs.length < 1 || it.refs.length > 2) err(`${where}: refs must have 1–2 ids`);
  else for (const r of it.refs) if (!refs[r]) err(`${where}: unknown ref "${r}"`);
}

function cueStats(items) {
  const n = items.length || 1;
  let keyLongest = 0, keyShortest = 0, keyHedgeOnly = 0, keyRefer = 0, distRefer = 0, neg = 0, vignette = 0, recall = 0;
  const pos = [0, 0, 0, 0];
  const flagCount = {};
  for (const it of items) {
    if (!Array.isArray(it.options) || it.options.length !== 4 || !Number.isInteger(it.answer)) continue;
    const L = it.options.map((o) => String(o).length);
    const k = it.answer;
    if (L[k] > Math.max(...L.filter((_, i) => i !== k))) keyLongest++;
    if (L[k] < Math.min(...L.filter((_, i) => i !== k))) keyShortest++;
    const hedged = it.options.map((o) => HEDGE.test(o));
    if (hedged[k] && hedged.filter(Boolean).length === 1) keyHedgeOnly++;
    if (REFER.test(it.options[k])) keyRefer++;
    distRefer += it.options.filter((o, i) => i !== k && REFER.test(o)).length ? 1 : 0;
    if (NEG.test(it.stem || '')) neg++;
    if (it.format === 'vignette') vignette++;
    if (it.cognitive === 'recall') recall++;
    pos[k]++;
    for (const fl of cueFlags(it)) flagCount[fl] = (flagCount[fl] || 0) + 1;
  }
  return {
    n: items.length,
    keyLongestPct: +(100 * keyLongest / n).toFixed(1),
    keyShortestPct: +(100 * keyShortest / n).toFixed(1),
    keyOnlyHedgedPct: +(100 * keyHedgeOnly / n).toFixed(1),
    keyReferPct: +(100 * keyRefer / n).toFixed(1),
    distractorReferPct: +(100 * distRefer / n).toFixed(1),
    negativeStemPct: +(100 * neg / n).toFixed(1),
    vignettePct: +(100 * vignette / n).toFixed(1),
    recallPct: +(100 * recall / n).toFixed(1),
    answerPositions: pos,
    absolutesOnlyInDistractorsPct: +(100 * (flagCount['absolutes-only-in-distractors'] || 0) / n).toFixed(1),
    collaborativeOnlyKeyPct: +(100 * (flagCount['collaborative-only-key'] || 0) / n).toFixed(1),
    multistepOnlyKeyPct: +(100 * (flagCount['multistep-only-key'] || 0) / n).toFixed(1),
  };
}

function checkCue(label, s, strict) {
  const report = strict ? err : warn;
  if (s.n < 8) return;
  if (s.keyLongestPct > (strict ? 35 : 40)) report(`${label}: key is the longest option in ${s.keyLongestPct}% of items (limit ${strict ? 35 : 40}%)`);
  if (s.keyOnlyHedgedPct > 10) report(`${label}: key is the only hedged option in ${s.keyOnlyHedgedPct}% of items`);
  if (s.keyReferPct > 12) report(`${label}: "refer" appears in the key in ${s.keyReferPct}% of items (limit 12%)`);
  if (s.negativeStemPct > 6) report(`${label}: negative stems ${s.negativeStemPct}% (limit ~5%)`);
  if (s.vignettePct < 75) report(`${label}: vignettes ${s.vignettePct}% (need ≥75%)`);
  if (s.recallPct > 22) report(`${label}: recall items ${s.recallPct}% (limit ~20%)`);
  if (s.absolutesOnlyInDistractorsPct > 10) report(`${label}: ${s.absolutesOnlyInDistractorsPct}% of items have absolute words only in distractors (limit 10%)`);
  if (s.collaborativeOnlyKeyPct > 12) report(`${label}: ${s.collaborativeOnlyKeyPct}% of items have collaborative wording only in the key (limit 12%)`);
  if (s.multistepOnlyKeyPct > 15) report(`${label}: ${s.multistepOnlyKeyPct}% of items have the key as the only multi-step option (limit 15%)`);
  const lo = Math.floor(s.n * 0.15), hi = Math.ceil(s.n * 0.35);
  s.answerPositions.forEach((c, i) => { if (c < lo || c > hi) report(`${label}: answer position ${i} used ${c}/${s.n} times (want ${lo}–${hi})`); });
}

function nearDupes(items, threshold) {
  const sh = items.map((it) => shingles(`${it.stem} ${(it.options || [])[it.answer] ?? ''}`));
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const s = jaccard(sh[i], sh[j]);
    if (s >= threshold) pairs.push([items[i], items[j], +s.toFixed(2)]);
  }
  return pairs;
}

function countSlots(items) {
  const m = {};
  for (const it of items) {
    const key = `${it.kg}|${it.domain}`;
    m[key] ??= { formA_scored: 0, formA_unscored: 0, formB_scored: 0, formB_unscored: 0, drill: 0 };
    if (it.pool === 'drill') m[key].drill++;
    else m[key][`form${it.pool}_${it.scored ? 'scored' : 'unscored'}`]++;
  }
  return m;
}

// ---------- card validation ----------
function validateCard(c) {
  const where = `${c._file} ${c.id ?? '(no id)'}`;
  for (const k of ['id', 'kg', 'title', 'body', 'examNote', 'refs']) if (!c[k] || (Array.isArray(c[k]) && !c[k].length)) err(`${where}: missing ${k}`);
  if (c.id && !/^card-[a-z0-9-]+$/.test(c.id)) err(`${where}: card id must look like card-g-izof`);
  if (c.kg && !KGS.includes(c.kg)) err(`${where}: bad kg`);
  if (c.body && (c.body.length < 200 || c.body.length > 1600)) warn(`${where}: body length ${c.body.length} chars (aim 450–1100)`);
  if (c.points && (!Array.isArray(c.points) || c.points.length > 5)) err(`${where}: points must be an array of ≤5`);
  if (c.category && !['ethics-principle', 'ethics-standard'].includes(c.category)) err(`${where}: bad category`);
  if (Array.isArray(c.refs)) for (const r of c.refs) if (!refs[r]) err(`${where}: unknown ref "${r}"`);
}

// =====================================================================
if (cardsArg) {
  const cards = loadArray(cardsArg);
  cards.forEach(validateCard);
  const ids = new Set(); for (const c of cards) { if (ids.has(c.id)) err(`duplicate card id ${c.id}`); ids.add(c.id); }
  finish({ cards: cards.length });
} else if (fileArg) {
  const rel = path.relative(ROOT, path.resolve(fileArg));
  const items = loadArray(rel);
  items.forEach(validateItem);
  const ids = new Set(); for (const it of items) { if (ids.has(it.id)) err(`duplicate id ${it.id}`); ids.add(it.id); }
  const w = alloc.writers.find((x) => x.file === rel);
  if (!w) warn(`${rel}: not in allocation.json (no slot check)`);
  else {
    const got = countSlots(items);
    for (const s of w.slots) {
      const g = got[`${s.kg}|${s.domain}`] || {};
      for (const k of ['formA_scored', 'formA_unscored', 'formB_scored', 'formB_unscored', 'drill']) {
        if ((g[k] || 0) !== s[k]) err(`${rel}: slot ${s.kg}/${s.domain} ${k} has ${g[k] || 0}, needs ${s[k]}`);
      }
    }
    for (const key of Object.keys(got)) if (!w.slots.find((s) => `${s.kg}|${s.domain}` === key)) err(`${rel}: items in unallocated cell ${key}`);
  }
  const s = cueStats(items);
  for (const it of items) { const fl = cueFlags(it); if (fl.length) warn(`${it.id}: cue pattern ${fl.join(', ')}`); }
  checkCue(rel, s, true);
  for (const [a, b, sim] of nearDupes(items, 0.35)) (sim >= 0.5 ? err : warn)(`near-duplicate (${sim}): ${a.id} ~ ${b.id}`);
  finish({ stats: s });
} else {
  // ---------- whole bank ----------
  const files = loadDir('content/items');
  const items = files.flatMap(loadArray);
  items.forEach(validateItem);
  const byId = new Map();
  for (const it of items) { if (byId.has(it.id)) err(`duplicate id ${it.id} (${it._file}, ${byId.get(it.id)._file})`); byId.set(it.id, it); }

  // forms match grid exactly + unscored distribution
  for (const f of ['A', 'B']) {
    const form = items.filter((x) => x.pool === f);
    const scored = form.filter((x) => x.scored);
    const uns = form.filter((x) => !x.scored);
    if (form.length !== bp.exam.items) err(`Form ${f}: ${form.length} items (need ${bp.exam.items})`);
    if (scored.length !== bp.exam.scored) err(`Form ${f}: ${scored.length} scored (need ${bp.exam.scored})`);
    if (uns.length !== bp.exam.unscored) err(`Form ${f}: ${uns.length} unscored (need ${bp.exam.unscored})`);
    for (const kg of KGS) for (const d of DOMAINS) {
      const n = scored.filter((x) => x.kg === kg && x.domain === d).length;
      if (n !== bp.grid[kg][d]) err(`Form ${f}: cell ${kg}/${d} has ${n} scored (grid ${bp.grid[kg][d]})`);
    }
    for (const d of DOMAINS) {
      const n = uns.filter((x) => x.domain === d).length;
      if (n !== bp.unscoredPerForm[d]) err(`Form ${f}: domain ${d} has ${n} unscored (want ${bp.unscoredPerForm[d]})`);
    }
  }
  // drill depth
  const drill = items.filter((x) => x.pool === 'drill');
  if (drill.length < 120) err(`drill pool has ${drill.length} items (need ≥120)`);
  for (const kg of KGS) for (const d of DOMAINS) {
    const n = drill.filter((x) => x.kg === kg && x.domain === d).length;
    if (n < bp.grid[kg][d]) err(`drill cell ${kg}/${d} has ${n} (need ≥${bp.grid[kg][d]} to build a full exam)`);
  }
  if (drill.length < bp.exam.items) err(`drill pool too small to build a 115-item mixed exam`);
  if (items.length < 350) err(`bank has ${items.length} items (need ≥350)`);

  // near-duplicates: across forms is an error; elsewhere warn
  const dupes = nearDupes(items, 0.3);
  for (const [a, b, sim] of dupes) {
    const crossForm = (a.pool === 'A' && b.pool === 'B') || (a.pool === 'B' && b.pool === 'A');
    if (crossForm && sim >= 0.35) err(`Form A/B near-duplicate (${sim}): ${a.id} ~ ${b.id}`);
    else if (sim >= 0.5) err(`near-duplicate (${sim}): ${a.id} (${a.pool}) ~ ${b.id} (${b.pool})`);
    else if (sim >= 0.35) warn(`similar (${sim}): ${a.id} (${a.pool}) ~ ${b.id} (${b.pool})`);
  }
  // cueing (global strict, per-file and per-pool warnings)
  const global = cueStats(items);
  checkCue('bank', global, true);
  for (const f of files) checkCue(f, cueStats(items.filter((x) => x._file === f)), false);
  for (const p of ['A', 'B', 'drill']) checkCue(`pool ${p}`, cueStats(items.filter((x) => x.pool === p)), false);

  // cards
  const cardFiles = loadDir('content/cards');
  const cards = cardFiles.flatMap(loadArray);
  cards.forEach(validateCard);
  const cids = new Set(); for (const c of cards) { if (cids.has(c.id)) err(`duplicate card id ${c.id}`); cids.add(c.id); }
  const principles = cards.filter((c) => c.category === 'ethics-principle').length;
  const standards = cards.filter((c) => c.category === 'ethics-standard').length;
  if (cards.length < 100) err(`${cards.length} concept cards (need ≥100)`);
  if (principles !== 6) err(`${principles} ethics-principle cards (need 6)`);
  if (standards !== 25) err(`${standards} ethics-standard cards (need 25)`);

  // ---------- stats ----------
  const tally = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const usedRefs = tally(items.flatMap((x) => x.refs || []), (r) => r);
  const stats = {
    items: items.length,
    pools: tally(items, (x) => x.pool),
    unscored: tally(items.filter((x) => !x.scored), (x) => x.pool),
    byDomain: tally(items, (x) => x.domain),
    byKg: tally(items, (x) => x.kg),
    cognitive: tally(items, (x) => x.cognitive),
    difficulty: tally(items, (x) => x.difficulty),
    format: tally(items, (x) => x.format),
    setting: tally(items, (x) => x.context?.setting),
    level: tally(items, (x) => x.context?.level),
    delivery: tally(items, (x) => x.context?.delivery),
    cueing: global,
    drillCells: Object.fromEntries(KGS.map((kg) => [kg, Object.fromEntries(DOMAINS.filter((d) => bp.grid[kg][d] > 0).map((d) => [d, `${drill.filter((x) => x.kg === kg && x.domain === d).length}/${bp.grid[kg][d]}`]))])),
    nearDuplicateWarnings: dupes.filter(([, , s]) => s >= 0.35).length,
    cards: { total: cards.length, byKg: tally(cards, (c) => c.kg), ethicsPrinciples: principles, ethicsStandards: standards },
    references: { registry: Object.keys(refs).length, cited: Object.keys(usedRefs).length, aaspListCited: Object.keys(usedRefs).filter((r) => refs[r]?.aasp).length },
  };
  fs.writeFileSync(path.join(ROOT, 'docs/content-stats.json'), JSON.stringify(stats, null, 2) + '\n');
  finish(stats);
}

function finish(stats) {
  if (!quiet) for (const w of warnings) console.log('WARN ', w);
  for (const e of errors) console.log('ERROR', e);
  if (!quiet) console.log(JSON.stringify(stats, null, 1).slice(0, 3000));
  console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
