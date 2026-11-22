# Revision brief: remove test-wiseness cues (round 2)

The bank passed a blind check (expert reviewers who saw stems and options but no keys agreed with 361/361 keys). But a reviewer who saw **only the four options, without the stem, picked the key 98% of the time**. Candidates could score well by test-taking strategy alone, which defeats the purpose of practice. Your job is to fix that in one item file while keeping every item correct and unambiguous.

## Read first
1. `docs/ITEM_WRITING_GUIDE.md` — especially the new section **"Distractor craft: beat test-wiseness"** (binding), plus the accuracy anchors.
2. Your item file in `content/items/`.
3. Your revision packet (path in your task): per item, the blind reviewer's confidence/alt/note, whether the options-only reviewer guessed the key, people's names to change, cross-file duplicates to rewrite, and names already used in the bank.

## What to do, item by item
- Rewrite distractors (and their rationales) so that, **without the stem**, all four options look equally professional and plausible. Each distractor is a near-miss that the stem rules out: wrong timing/sequence, right technique for a different problem, wrong level or person, well-meant but out of scope, or second-best for what the stem asks. Keep them parallel in tone, length, structure and specificity with the key. Spread collaborative/ethical/evidence vocabulary across options, and don't let absolutes mark the wrong answers.
- You may also reword the key (not its meaning) to remove stem echoes or make it less distinctive, and sharpen the stem with the detail that decides between near-miss options. Every stem must still be answerable before reading the options, with exactly one best answer an experienced CMPC would agree on. Making distractors more plausible raises ambiguity risk: whenever a distractor becomes defensible, add the deciding detail to the stem.
- Address every blind-review note in your packet (fix the issue, or keep the item and state why in your final reply).
- Rename people listed under `rename_people` with fresh fictional names that are **not** in `names_already_used_in_bank`, and don't reuse a name within your file. Update the name everywhere in that item (stem, options, rationales, takeaway).
- Rewrite each item listed in `cross_file_duplicates_to_fix` so it tests a different concept (same id, pool, domain, kg; new topic/scenario).
- Keep `id`, `pool`, `scored`, `domain`, `kg` unchanged. Update `topic`, `cognitive`, `difficulty`, `context` if they change. Keep stored answer positions balanced (~25% each). Rationales must still explain why the key is best (naming the principle/theory/standard) and why each distractor is not, with no option letters.
- Run `node scripts/validate-bank.mjs --file <your file>` until 0 errors; review every `cue pattern` warning (they're heuristics — fix real tells, ignore false positives).
- Then do your own **cover-the-stem pass**: for each item, read only the options. If one stands out, rewrite again.

## Rules
Edit only your item file (work copies in `content/items/.work/` are fine). No git, no network, don't start subagents, never copy questions from anywhere. Reply with: count of items changed, validator summary line and cue stats, every blind note you chose not to act on (id + why), and any item you're unsure about.
