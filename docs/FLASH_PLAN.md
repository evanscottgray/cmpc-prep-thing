# Plan: Flash drill (v1.4.0), revision 2

Revision 2 folds in council round 1 (Opus 7, Gemini 7, Sol 6). Changes from revision 1 are summarized at the end.

## Why

Early feedback: people are surprised by how much of the app is scenario-based. That matches the exam (the bank is 362 vignettes and 2 direct items), but learners also want quick recall practice for the facts the scenarios rest on: theory names, models, ethics standards, instruments, definitions. Concept cards are free recall with self-rating. Nothing today checks a fact in 2–3 minutes with a right/wrong answer.

## What we add

A **Flash drill**: short rounds (10 or 20) of fast fact questions with instant, explanatory feedback, separate from the exam-style bank. It is an add-on to scenario practice, never the primary daily action. Fact quizzing improves fact recall more than applied performance (Agarwal 2019), so scenario practice stays the main path.

### Formats

| Format | Shape | Answer UI |
|---|---|---|
| `mc` (~75%) | A short direct question (≤ 30 words), or a sentence with one `____` blank; 3–4 short options (≤ 10 words) | Tap an option |
| `tf` (~25%) | One unambiguous, unhedged claim taken directly from the card | Two big buttons: True / False |

Every fact has a 1–2 sentence `explain`. For a false `tf` fact, the explanation **opens with the corrected true statement**, shown in bold, so the last thing read is the true fact (this guards against learners later remembering false statements as true; Roediger & Marsh 2005).

### Study methods, stated modestly

| Method | Evidence | In the app |
|---|---|---|
| Retrieval practice with corrective feedback | Roediger & Karpicke 2006; Butler & Roediger 2008 | Every fact is a question; the verdict + explanation follows each answer |
| Spaced retrieval | Cepeda et al. 2006 | Leitner boxes compressed to the exam date (see Scheduling) |
| Correct-once-per-round relearning | Rawson & Dunlosky 2011 (successive relearning across sessions) | A missed fact comes back once at the end of the same round, and returns on a short schedule across later rounds |
| Mixed topics | Rohrer & Taylor 2007 | The default round mixes knowledge groups and allows at most one fact per card; this is for variety and coverage, not a claim of an interleaving effect |
| Recall before recognition | Kang, McDermott & Roediger 2007 | Prompt copy: "Answer in your head first, then tap" (no extra step) |

### Fun

- The existing `.streak-chip` ("🔥 5 in a row") from the tutor runner, reused, with no new animation.
- Pocket confetti on the summary when ≥ 80% are right on the first try (reuses `celebrate.ts`; `firstTime` keyed per round; respects motion and celebration settings).
- The summary shows first-try score, best streak, "N facts moved up", "N will come back sooner", **Another round**, and **Done**.
- Keyboard: `T`/`F`, `1`–`4`, `Enter` for Next. Ignores key repeat, modifier keys, focus in inputs, and open dialogs.

## Scheduling (exact)

A new `scheduleFlash(prev, grade, today, examDate)` with `scheduleCard` semantics (every entry kept, never `null`):

- First answer of a fact in a round: right → box+1 (a new fact starts at box 1); wrong → box 0, due tomorrow.
- **"That was a guess"**: an optional button shown only after a correct answer. It re-grades that answer as `unsure` (keeps the box, same interval), replacing the right grade for this round.
- **The in-round retry of a miss never writes storage.** It is practice to criterion only. It doesn't count toward first-try score or the streak chip, and the progress bar counts facts, not retries ("N of M facts").
- New = no entry. Practiced = has an entry. Mastered = box ≥ 3.
- Every count (due, new, practiced, mastered) and the round builder use only ids in the current bank. Entries for removed facts stay stored and untouched but are ignored, so they can't get stuck as "due".
- Grades read `ctx.store.state` at the moment of answering, as cards do, so a grade never writes back an older copy.

## Round building

- Pool: the chosen filter (Mixed, or one knowledge group).
- Order of preference: due facts, then new facts (weighted by blueprint weight × weakness from `areaAccuracy`, read-only), then a top-up of the soonest-due practiced facts ("Practicing ahead"). If the pool is smaller than the round size, the round is shorter. It never dead-ends while any fact exists.
- At most one fact per card per round. If the filtered pool can't fill the round that way, more facts from the same card are allowed, never adjacent.
- **Final days** (`isLight`: taper or exam day): no new facts, practiced facts only, as `CardStudy` does.
- A round lives in memory. Reloading or tapping "Update now" ends it; every first-try grade is already saved. This is the same as concept cards.

## Keeping existing on-device data safe (the most important part)

The app is in use. Existing scores, history, reviews, streak days, settings and backups must not change.

1. **One new store part, and nothing else is written.** `flash: { srs: Record<factId, SrsEntry>; days: string[] }` goes into `Part`, `PARTS` and `emptyState`. Flash never writes `attempts`, `sessions`, `srs`, `cardSrs`, `settings`, `reports`, `hidden` or **`meta`**. Flash study days live in `flash.days`, not `meta.days`, so a flash round can't prune or race existing study days or `meta.exposed`. `studyDays()` reads `flash.days` as one more source for the streak.
2. **Readiness and stats are untouched.** Readiness, estimated score, exam history, Progress accuracy, the daily question goal and weak-area weighting all read `attempts`/`sessions`. The only shared effect is that a flash day counts toward the study streak (a read-only union).
3. **No migration, no schema bump.** `SCHEMA` stays 1. A missing `flash` key loads as `emptyState()`'s value. Nothing existing is rewritten on first load. A malformed stored `flash` value (not an object with object `srs` and array `days`) is treated as empty in memory and left as is on disk until the next flash grade.
4. **Backups.**
   - `parseBackup` validates `flash` when present (object `srs`, array `days`, otherwise the whole backup is rejected with a clear message before anything is replaced) and defaults it to empty when absent (v1.3.0 backups).
   - `summarize` reports flash separately (`flash: N`). The existing `reviews` count stays `srs + cardSrs`, so restore previews still match v1.3.0 numbers.
   - Restoring a v1.3.0 backup clears flash progress (the backup has none). The restore preview says so.
   - Rollback: v1.3.0's `replaceAll` clears the store and writes only the parts it knows. A new backup restored on v1.3.0 brings back every v1.3.0 part and drops flash. Documented in DECISIONS, not prevented.
5. **Reset** clears flash through `emptyState()`.
6. **Stale rounds after reset or restore.** A round records `meta.createdAt` when it starts. If that has changed by grade time (reset or restore happened, possibly in another tab), the grade isn't saved, and the round ends with "Your data was replaced; start a new round."
7. **Update flush.** "Update now" awaits `ctx.store.flush()` before telling the waiting worker to skip waiting. This is a two-line change that protects every pending write, not only flash.
8. **Content.** Exam item and card ids, fields and values are unchanged. The release check compares the compiled `items`, `cards`, `blueprint` and `refs` of v1.3.0 and v1.4.0 by value. Refs may only gain entries. Flash ids use the `fl-` prefix, and the validator rejects collisions. `ctx.bank.flash ?? []` is used everywhere, so a stale cached bank without `flash` just hides the drill.

Not in scope: making the pre-existing clear-then-write restore atomic (`Store.replaceAll`), and cross-tab merging of concurrent writes to the same part. Both predate this feature; flash adds no new kind of exposure (it behaves like `cardSrs`). They are noted as follow-ups.

### Proof plan

- **Unit tests:**
  - `loadState` on a v1.3.0-shaped fixture returns every existing part deep-equal, with an empty `flash`.
  - Grading writes only `flash`.
  - `scheduleFlash` transitions, including the guess re-grade.
  - The in-round retry writes nothing.
  - A removed fact id isn't counted as due.
  - Round building: a small pool, one fact per card, the final-days rule, the top-up.
  - `studyDays` union.
  - `parseBackup`: v1.3.0 file, malformed flash rejected, new file round trip.
  - `summarize`.
  - Reset clears flash.
  - The stale-round guard.
  - The same store tests on the `localKv` fallback.
- **E2E (WebKit, 4 sizes):**
  - Seed a realistic v1.3.0 state (two exams, drills, reviews, cards, reports, hidden, exposed, streak days).
  - Run a full flash round with a miss, its retry, and a guess.
  - Assert that the raw IndexedDB values of every v1.3.0 key (`settings`, `attempts`, `srs`, `cardSrs`, `reports`, `hidden`, `meta`, every `session:*`) are byte-identical to the seed.
  - Assert that the Today, Progress and exam results text is unchanged.
  - Reload, and confirm flash progress persists.
  - Keyboard, focus (the verdict on reveal, the prompt on advance), reduced motion, a11y (axe).
- **Upgrade test (release gate):**
  - Serve the real `v1.3.0` tag build at a Pages-like subpath.
  - Create data through its UI: a finished quiz, cards, and an **active timed block mid-answer**.
  - Swap the server to the new build, and let the "Update ready" banner appear.
  - Confirm it stays hidden during the timed block. Finish the block, tap Update now, and confirm the block's answers, its result and all legacy keys are byte-identical.
  - Do a flash round, then cold-reload offline and confirm the drill and data work.
  - Open a second tab still on v1.3.0, write a legacy part there (answer a quiz question), and confirm `flash` is intact in IndexedDB.

## Content

- `content/flash/*.json`, compiled into `bank.json` as `flash: Flash[]`, sorted by id. Flash refs are added to `usedRefs`. The existing `items` and `cards` output is unchanged.
- Schema:
  ```json
  { "id": "fl-g-001", "kg": "G", "card": "<card id>", "type": "mc",
    "prompt": "...", "options": ["...", "...", "..."], "answer": 0,
    "explain": "...", "refs": ["..."] }
  ```
  A `tf` fact has no `options`, and its `answer` is `true` or `false`. A `card` must exist and share the fact's `kg`.
- **Target ~225 facts**, by blueprint weight. Ethics (KG E) is capped so its 35 cards don't swamp the bank:

  | KG | A | B | C | D | E | F | G | H | I | J | K | L | M |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | facts | 20 | 18 | 9 | 15 | 24 | 13 | 24 | 11 | 44 | 9 | 9 | 20 | 9 |

- **Writing:** content-writing subagents follow a new `docs/FLASH_WRITING_GUIDE.md`.
  - Ground every fact in its card's text, and use only claims the card states without hedging.
  - `tf`: single claims; no one-word-swap tricks; no negations; balanced about 50/50; absolute words ("always", "never", "only") must not skew toward false.
  - `mc`: plausible, parallel distractors from the same family (other theories, standards, instruments); the key explains the distinction.
  - No two facts from the same card may answer each other.
  - Blanks have no grammar cues (no a/an before the blank; options agree in number).
- **Validator** (`validate-bank.mjs --flash`):
  - Schema, unique `fl-` ids, and card/KG agreement.
  - Refs in the registry.
  - Option count (3–4), lengths, and unique normalized options.
  - Answer type and range.
  - Nonempty `explain` and refs.
  - At most one blank.
  - The key is the longest option ≤ 40% of the time, and key positions are balanced.
  - The `tf` true/false balance and the absolute-word skew.
  - No "all/none of the above".
  - No letter references.
  - Near-duplicates.
- **Two independent checks by other models:**
  1. **Blind answer** (`blind-check.mjs --flash`, adapted to 3–4 options and T/F, plus an options-only pass for `mc`).
  2. **Source support:** for each fact, is the claim (and for `mc`, the key and only the key) fully supported by the text of the card named in `card`?

  Any disagreement or unsupported claim is fixed or the fact is dropped.
- Measure `bank.json` growth (expected +80–120 KB on 841 KB). If it is over 150 KB, split flash into its own file, loaded without blocking startup.

## UI

- **Study tab:** "Flash drill" first under Short sessions ("Quick recall: multiple choice and true/false"), with a badge showing N due, or "New". It opens a small setup modal like `DrillSetup`: 10 or 20, Mixed or a knowledge group, Start.
- **Today:**
  - A "Flash · 10" button beside "Quick quiz · 10" in the study card, so new learners find it.
  - A "Flash drill · N due" row in "Due reviews". Flash due feeds `hasRight` and that section's guard.
  - Final days: the row goes in the light "Optional" list instead, practiced facts only.
  - The streak copy becomes "Any question, card, flash fact or review…".
  - The daily-goal note says it counts exam-style questions.
- **Route:** `#/flash?n=10&kg=` is the runner. The tab bar is hidden there, as on `cards/study`.
- **Runner:**
  - The prompt on a card, the answer buttons, and a verdict with the explanation.
  - A quiet "Read the concept card" link (to `#/card/<id>`) after answering.
  - "That was a guess" after a correct answer.
  - "N of M facts" with a bar.
  - Focus goes to the verdict on reveal and to the prompt on advance (matching TutorRunner).
  - The aria-live verdict and 44 px targets match the existing patterns.
- **Summary:** first-try score, best streak, moved up / comes back sooner, confetti at ≥ 80%, and the line "Flash facts count toward your study streak, not the daily question goal." Then Another round and Done.
- **Progress:** one stat tile, "Flash facts practiced N/total", with "M mastered" as its sub-label. It sits in the existing stat grid.

## Out of scope

- Typed answers, audio, timed or leaderboard modes.
- Changes to exam items or cards.
- Counting flash toward readiness or the daily question goal.
- A separate flash hub page.
- Confidence prompts before answering.
- Problem reports for flash facts (a follow-up: reports and their export assume exam item ids).
- Atomic restore and cross-tab merging (see above).

## Release

- Branch `flash-drill` → v1.4.0.
- Proof: unit tests and Playwright WebKit e2e at 4 sizes, the upgrade test, and screenshots.
- sol-loop, then a PR with a council table.
- Merge, the Pages deploy, tag `v1.4.0`, and `verify-release.sh`.
- Add a "v1.4.0 (flash drill)" section to DECISIONS.md, covering the rollback behavior, the Agarwal caveat, and the follow-ups.

## Changes from revision 1

- Scheduler pinned to `scheduleCard` semantics. Only the first try is graded; the retry writes nothing.
- Flash study days moved out of `meta` into `flash.days`.
- Facts removed from the bank are ignored.
- Wiring is fully specified: `Part`/`PARTS`/`emptyState`/`Bank`, a separate `summarize` count, the guards in Today, the tab bar, the light phase, the stale-round guard, flush before update, and refs in build.
- Cloze is folded into `mc`. True/false is cut to ~25%, with corrected statements first and stricter rules.
- The 300-fact target dropped to ~225 with a per-KG table, and ethics is capped.
- A source-support check was added, and the validator and blind-check were extended.
- The pre-answer confidence chip and the hypercorrection note were dropped, replaced by "That was a guess" after a correct answer.
- The pulse animation is cut (the streak chip is reused), and the hub page is cut (a modal instead).
- Proof expanded: byte-identical legacy keys, a real v1.3.0 → v1.4.0 service-worker upgrade with an active timed block, a v1.3.0 second tab, rollback, and the `localKv` fallback.

## Revision 3 (council round 2: Opus 8, Gemini 8, Sol 7). These points override the sections above.

- **Scheduler:** reuse `scheduleCard` directly. There is no `scheduleFlash`.
  - **Practice-ahead answers** (a fact that isn't due yet) never raise its level: a right answer writes nothing, a wrong one resets it to level 0. Repeated rounds can't fake mastery.
  - **"That was a guess"** re-grades from the entry captured *before* the answer, merged into the current state. It is hidden on retries and on practice-ahead answers. A guessed answer still counts as right on the first try (score, streak), but not as "moved up".
- **Retry wording:** "a missed fact comes back once at the end of the round". If the retry is missed too, the round just moves on.
- **Stale-round guard:**
  - In the same tab, reset and restore already unmount the runner.
  - Across tabs, a round stores `meta.createdAt` and the store's `replaceEpoch` when it starts. `replaceAll` bumps the epoch and pings with a `replace:` value. Other tabs bump their epoch on that ping before they reload; v1.3.0 tabs only compare the key, so this is compatible.
  - A grade is dropped if either value changed.
  - The leftover window, a grade made before the ping arrives, is the same exposure `cardSrs` already has. It is documented, not fixed.
- **Validation of stored flash data:**
  - A clean-up step keeps only well-formed entries: `srs` is a plain object; each entry has a finite `box`, a string `due` and a finite `last`; `days` holds `YYYY-MM-DD` strings.
  - On load, the cleaned value is used in memory; the stored value is left alone until the next grade.
  - In `parseBackup`, a malformed flash part **doesn't block the restore**. Everything else restores, flash comes back empty, and the preview says "Flash progress in this file couldn't be read".
  - The preview also warns "Your current flash progress will be cleared" when the device has flash progress and the backup has none.
  - `summarize` adds a separate `flash` count; `reviews` is unchanged.
- **Cut:** the flush-before-update change. A v1.3.0 → v1.4.0 update runs v1.3.0's handler anyway; it goes on the follow-up list.
- **Cut:** splitting flash out of `bank.json`. Flash stays in `bank.json`; growth is measured and reported.
- **The concept card opens in a modal** (`CardBody` in a `Modal`) from the runner, so the round isn't lost.
- **Display:**
  - `mc` options are shuffled at display time (reshuffled for the retry), and keys `1`–`4` follow the display order.
  - A false `tf` has a required `correction` field (one sentence, the true statement), rendered in bold before `explain`.
- **Final days:** practiced facts only. With none practiced, the runner shows "Nothing practiced to review yet", and Today hides the optional row.
- **Small pools:** the setup modal shows the pool size, and sizes larger than the pool become "All N".
- **Progress:** the coverage section shows when there are attempts **or** practiced flash facts.
- **Today:**
  - The backup reminder counts flash progress, so a learner who only uses flash still gets backup reminders.
  - First visit counts flash too.
- **Content:**
  - At most 3 facts per card (KG L target 18).
  - Flash is validated in the default `npm run validate`, which runs in the build.
  - The source check also covers distractors (each must be wrong according to its own card or a cited source) and false-statement corrections (the card must contradict the claim). Ethics facts are checked against the Ethics Code standard the card names.
- **Evidence table:** the "recall before recognition" row becomes a plain prompt nudge, with no citation.
- **E2E comparison:**
  - Snapshot IndexedDB right before the first flash answer and compare it after the summary: every legacy key must be byte-identical.
  - Assert these numbers are unchanged: readiness, estimated score, daily question count, domain and KG accuracy, exam history, and question and card due counts.
  - Assert separately that the streak goes up by at most one.
- **Upgrade test:** open the old v1.3.0 tab *before* the upgrade and keep it loaded, then write a legacy part from it after the flash round.
- **Another round** remounts the runner with a new key; navigating to the same hash doesn't notify the router.
