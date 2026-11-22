# Revision brief, round 3: make the stem necessary

**Evidence.** After round 2, with item ids hidden, two weaker models shown only the four options still picked the key 88% and 92% of the time (chance 25%). With stems the weaker one scored 98%. Wording tells are gone; what remains is *content*: one option is better practice in general, whatever the question. Those items reward test-wiseness and would inflate practice scores.

**Goal.** Each option must be the best answer to some realistic nearby question. Only the stem's facts decide.

## Method (required, item by item)
1. **Write the swap.** For each of the three distractors, write one sentence: "This would be the key if the stem said ___." The change must be one or two realistic facts (a different timing, symptom, consent status, role, goal, phase, data pattern, client preference), never "if the consultant were careless". If you can't write it, the distractor is bad in general: replace it.
2. **Put the decision in the stem.** The stem carries the fact(s) that make the key best and, by the same facts, make each distractor wrong. An experienced CMPC must reach one answer, before seeing the options.
3. **Vary what wins.** Across your file, the key is often NOT the collaborative / exploratory / gather-more-information / two-part option. In many scenarios the right move is to act now, hold a boundary, decline, keep the plan, stop, be directive, skip further assessment, use the simple or narrow technique, or do nothing new. Aim for at least a third of keys to be an option that would look like the *less* ideal one out of context.
4. **Good shapes:** four legitimate techniques, theories, instruments, goals, or microskills, one matched to the data; four defensible next steps at different points of the consulting sequence; four people or levels to work with; the same action at four timings; four readings of the same data.
5. **Bad shapes:** one right answer plus three errors; one ethical answer plus three lapses; one complete answer plus three partial ones. For ethics/safety items where only one act is acceptable, keep the rule intact and ask instead *what the situation is*, *what to do first*, *whom to contact*, *what may be shared with whom*, or *which limit applies*, so that all four options are lawful, ethical acts and the facts decide.
6. **Cover-the-stem test**, then the reverse: hand yourself each swap sentence and confirm that distractor really would win.

## Constraints
Never trade correctness for difficulty: exactly one best answer, all facts certain, guide anchors binding, safety/scope handling unchanged. Keep id, pool, scored, domain, kg and stored answer positions; keep stems about 45–110 words, options 4–20 words and parallel; rationales for every option (say what the stem's fact is that rules it out); no letters. You may change topic, scenario, and key freely within the same cell. Don't duplicate other items (see `grep` across `content/items`). Keep new names unique across `content/items`.

Record the swaps in `content/items/.work/<file>-swaps.json` as `{ "<id>": ["option text → swap sentence", ...] }`. Edit only your item file. No git, no network, no subagents. Validate with `node scripts/validate-bank.mjs --file <file>` to 0 errors. Reply with items changed, how many keys are now the "less ideal out of context" option, and items you're unsure about.
