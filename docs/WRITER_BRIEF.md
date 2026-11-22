# Writer brief (for content-writing agents)

You are writing original practice content for **CMPC Prep**, a study app for one candidate preparing for the Certified Mental Performance Consultant (CMPC®) exam from AASP. Content quality matters more than anything else in this project: an ambiguous or wrong item is a failure.

Read these first, in full:
1. `docs/ITEM_WRITING_GUIDE.md` — the schema and quality bar (binding).
2. `content/allocation.json` — find the entry for your file; it lists exactly how many items you write in each slot (Form A scored/unscored, Form B scored/unscored, drill) per knowledge group (KG) × domain cell.
3. `content/references.json` — the only citations you may use (cite by id; 1–2 per item). Prefer AASP-list texts (`"aasp": true`) and the primary source for a named theory.

## The exam (context)

115 four-option multiple-choice items in 90 minutes; 100 scored, 15 unscored trial items. Items are applied and scenario-based, aimed at a **newly certified consultant** (2023 job analysis). ~47 seconds per item, so stems should be readable in ~25–35 seconds: typically 45–110 words. Options are short and parallel (typically 6–22 words).

## Domains (what an item in each domain is *about*)

- **I. Rapport, Roles, and Expectations** — identifying the client and stakeholders; building rapport; explaining the consulting process; clarifying role, scope, informed consent, confidentiality, boundaries, working alliance, and referrals in individual, team, and organizational work; cultural and contextual factors.
- **II. Assessment** — initial assessment content (reasons for consulting; performance history and demands, injury, motivation; health and self-care; cultural/contextual factors inside and outside the performance environment; strengths, metrics, readiness for change); culturally responsive methods (interviews, observation, questionnaires, stakeholder input); judging consultant–client fit; referring out.
- **III. Goals, Outcomes, and Planning** — interpreting assessment data with evidence and a philosophy of practice; prioritizing goals collaboratively; resources and barriers; building an evidence-informed mental performance plan; deciding how progress will be measured.
- **IV. Implementation** — delivering the plan with the client actively engaged; facilitating individual, team, and organizational training with reflection and debriefing; working through stakeholders (athletic trainers, coaches/train-the-trainer, managers).
- **V. Evaluation** — monitoring effectiveness; reassessing with client and stakeholders; revising the plan or goals; concluding consultation; ongoing self-reflection.
- **VI. Professional Responsibilities** — maintaining competence; laws and the AASP Ethics Code; handling ethical issues; abuse prevention (SafeSport); cultural competence and humility; self-care; educating consumers about the CMPC credential and its scope; referrals.

An item in cell (KG × Domain) tests the KG's knowledge **as applied to that domain's task**. Example: KG G (foundational theory) in Domain III = using a theory to interpret assessment data or choose a plan; KG G in Domain IV = using a theory to explain or adjust what happens during delivery.

## How to work

1. Plan first: list every slot you must fill, and give each item a distinct topic + scenario so that **no two items in your file are near-duplicates**, and Form A and Form B cover the same ground with *different* scenarios, settings, and specific concepts (parallel forms, not clones). Spread items over the variety dimensions in the guide (settings, levels, delivery formats, diverse fictional names). Plan the answer position (0–3) for each item up front so positions balance (~25% each) and plan option lengths so the key is the longest option in no more than ~30% of items.
2. Write in batches of ~8–12 items to `content/items/.work/<yourfile>-<n>.json` (each a JSON array). Then merge all batches, in order, into your final file `content/items/<yourfile>.json` (a single JSON array), e.g. `node -e "const fs=require('fs');const d='content/items/.work/';const a=fs.readdirSync(d).filter(f=>f.startsWith('<yourfile>-')).sort((x,y)=>parseInt(x.split('-').pop())-parseInt(y.split('-').pop())).flatMap(f=>JSON.parse(fs.readFileSync(d+f)));fs.writeFileSync('content/items/<yourfile>.json',JSON.stringify(a,null,1))"`.
3. Validate: `node scripts/validate-bank.mjs --file content/items/<yourfile>.json`. Fix every ERROR and reread every WARN. Repeat until 0 errors.
4. Concept cards: write the cards assigned to you to `content/cards/<yourfile>.json` (schema in the guide §5) and validate with `node scripts/validate-bank.mjs --cards content/cards/<yourfile>.json`.
5. Self-review pass before finishing — reread every item as a skeptical expert CMPC:
   - Is exactly one option best, and would experienced CMPCs agree? Could a strong candidate argue for a second option? If so, sharpen the stem.
   - Can the stem be answered before seeing the options?
   - Is every fact certain? Is the safety/scope handling right (no diagnosing; refer when warranted; emergency procedures when imminent risk; mandated reporting for suspected abuse of minors)?
   - Do rationales explain why the key is best (naming the principle/theory/standard) and why each distractor isn't, without letters?
   - Does the key stand out by length, hedging, specificity, or word repetition from the stem?
6. Don't edit any other files. Don't run git commands (no commits). Don't use the network. Never copy or adapt questions from anywhere; write everything yourself.

## Finish

Reply with: your file paths, item count, card count, the validator's final summary line, the cueing stats it prints, and any item you are unsure about (id + why).
