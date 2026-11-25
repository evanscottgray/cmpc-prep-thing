# Flash fact writing guide

Flash facts are short recall questions for the app's **Flash drill**. They complement the scenario bank: quick, certain, single-idea checks of what the concept cards teach. A wrong or ambiguous fact is a failure. When in doubt, leave it out.

## Ground rules

- **Grounded in one card.** Every fact names the concept card it comes from (`card`), and every claim in it, including the key, the correction for a false statement, and the explanation, must be stated in that card's text (`body`, `points` or `examNote`) **without hedging**. If the card says "often", "may", "is commonly summarized as" or contrasts views, either keep that qualifier in the fact or don't write it.
- **Original wording.** Don't copy sentences from the card verbatim into the prompt (rephrase), and never copy from any outside source.
- **One idea per fact.** No double-barrelled claims ("X and Y").
- **No trivia.** No dates, publication years, page numbers, or author-name matching for its own sake. A theory's originator is fine only when the field names it that way (e.g. "Bordin's working alliance", "Hanin's IZOF").
- **At most 3 facts per card**, and usually 1–2. Spread facts across the card's distinct ideas, and across the cards in your assignment. **No two facts from the same card may give away each other's answer** (one fact's prompt must not state another's key).
- **refs:** 1–2 ids, taken from the card's own `refs`.

## Formats

### `mc` (about 75%)

- `prompt`: a direct question (≤ 30 words) ending in `?`, **or** a sentence containing exactly one blank written `____` (cloze) ending in `.`.
- `options`: 3 or 4 strings, each ≤ 10 words, parallel in grammar and similar length. Distractors come from the same family as the key: other theories, other standards, other instruments, other model components. Every distractor must be clearly wrong *for this prompt* and plausible to a less-prepared learner.
- `answer`: index of the key. Balance positions across your file; the key is the longest option in no more than ~30% of your facts.
- For cloze: no grammar cues. Don't put "a"/"an" right before the blank, and make every option agree in number and part of speech with the sentence.
- Not allowed: "all/none of the above", "both", "A and B", negative stems (NOT/EXCEPT), absurd options.

### `tf` (about 25%)

- `prompt`: one declarative statement (≤ 30 words), no question mark, no negation ("not", "never" as the hinge), no double negatives.
- `answer`: `true` or `false`. Aim for 50/50 across your file.
- A false statement must be **clearly** false per the card, by substituting a different, real concept (wrong theory component, wrong standard, wrong order), **not** a one-word trick or a subtle quantity change.
- Absolute words ("always", "never", "only", "all") must not be a tell: use them in true statements as often as in false ones, or avoid them.
- Only use true/false for crisp, unhedged claims.

## `explain`

- 1–2 sentences, ≤ 45 words, plain teaching tone. Say *why* the key is right (the distinction being tested), not just restate it.
- For a **false** `tf`: also give `correction`, one sentence that is the true statement (the app shows it in bold before `explain`), and must itself be stated in the card. Example: `"correction": "Mastery experience, not verbal persuasion, is the strongest source of self-efficacy."` The `explain` then adds why. A true `tf` and every `mc` have no `correction`.
- Never refer to letters or positions ("option B", "the first choice"): options are shuffled.

## Schema

```json
{ "id": "fl-g-001", "kg": "G", "card": "<card id from content/cards>", "type": "mc",
  "prompt": "...", "options": ["...", "...", "..."], "answer": 0,
  "explain": "...", "refs": ["..."] }
{ "id": "fl-g-002", "kg": "G", "card": "<card id>", "type": "tf",
  "prompt": "...", "answer": false, "correction": "The true statement.", "explain": "...", "refs": ["..."] }
```

- `id`: `fl-<kg lowercase>-<NNN>`, 3 digits, unique, sequential within a KG.
- `kg` must equal the card's `kg`.

## Self-review before you finish

Reread every fact as a skeptical expert CMPC:
1. Is every claim stated (unhedged) in the named card? Would experts agree on exactly one answer?
2. Cover the options: could a prepared learner answer the prompt? Read only the options: is the key obvious without the prompt (longest, most specific, stem word repeated)? Fix it.
3. For false `tf`: is it unmistakably false *according to the card* (the card contradicts it, not merely omits it), and is `correction` the true statement from the card?
4. Does any fact give away another fact's answer?

## Validate

`node scripts/validate-bank.mjs --flash content/flash/<file>.json` checks the schema, the card link, cueing and balance. Fix every ERROR; reread every WARN. The whole-bank run (`npm run validate`) checks all flash files together.
