# Item-Writing Guide — CMPC Prep

This guide is the contract for every question and concept card in the bank. New content must follow it so it matches existing items and passes `npm run validate`.

All content is **original**. Never copy, adapt, or paraphrase questions from any source (Quizlet, Docsity, commercial banks, AASP's Essential Guide, forums, "recalled" exam items, textbooks' end-of-chapter questions). Don't reproduce text from any source. Write from your own understanding of the field.

---

## 1. Files and IDs

- Questions live in `content/items/*.json`. Each file is a JSON **array** of item objects.
- Concept cards live in `content/cards/*.json` (JSON array of card objects).
- Citations live only in `content/references.json`. Items and cards cite registry **ids** (e.g. `"weinberg2024"`). Never cite anything that is not in the registry. If you truly need a new source, add it to the registry only if you are certain it exists (authors, year, title, venue) — no page numbers, chapters, or quotations.
- `content/allocation.json` says exactly which slots each file fills (pool × domain × knowledge group × scored).
- Item id format: `<KG>-<DOMAIN>-<NNN>`, e.g. `I-IV-007`, `E-VI-003`. NNN is a 3-digit sequence unique within that KG+domain. Ids never encode the pool, so an item can be moved between pools.

## 2. Item schema

```json
{
  "id": "G-III-004",
  "pool": "A",
  "scored": true,
  "domain": "III",
  "kg": "G",
  "topic": "Multidimensional anxiety theory",
  "cognitive": "application",
  "difficulty": 2,
  "format": "vignette",
  "context": { "setting": "individual-sport", "level": "collegiate", "delivery": "individual" },
  "stem": "Full stem text ending in a direct question?",
  "options": ["Option text", "Option text", "Option text", "Option text"],
  "answer": 2,
  "rationales": [
    "Why this option is not best (refer to its content, never a letter).",
    "Why this option is not best.",
    "Why this option IS best — name the principle, theory, or standard.",
    "Why this option is not best."
  ],
  "takeaway": "One-line teaching point.",
  "refs": ["martens1990", "weinberg2024"]
}
```

Field rules:

| Field | Allowed values |
|---|---|
| `pool` | `"A"` (Form A), `"B"` (Form B), `"drill"` |
| `scored` | `true` for every drill item and every scored form item; `false` only for the unscored trial items on a form |
| `domain` | `I`–`VI` |
| `kg` | `A`–`M` |
| `topic` | Short human label (2–6 words), e.g. "Informed consent with minors" |
| `cognitive` | `recall`, `application`, `analysis` |
| `difficulty` | `1` easy, `2` moderate, `3` hard |
| `format` | `vignette` (a realistic case/situation) or `direct` (no scenario) |
| `context.setting` | `team-sport`, `individual-sport`, `para-sport`, `performing-arts`, `tactical`, `esports`, `business`, `exercise-health`, `general` |
| `context.level` | `youth`, `adolescent`, `collegiate`, `elite`, `professional`, `masters`, `recreational`, `adult`, `na` |
| `context.delivery` | `individual`, `team`, `organizational`, `virtual`, `na` |
| `options` | exactly 4 strings |
| `answer` | index 0–3 of the single best option |
| `rationales` | exactly 4 strings, parallel to `options` |
| `refs` | 1 or 2 registry ids |

## 3. Quality bar

**Single best answer.** Four options, one clearly best answer that an experienced CMPC would agree on. Distractors should be plausible to a less-prepared candidate (common misconceptions, actions that are reasonable but premature, out of scope, or second-best), but clearly inferior on reflection. If two options are defensible, rewrite the stem to add the detail that decides between them.

**Vignettes.** At least 75% of items are realistic vignettes. Each stem ends in a direct question: *What should the consultant do first? What is the most appropriate next step? Which theory best explains…? Which approach best fits…?* A prepared candidate should be able to answer the stem **before reading the options** (cover-the-options test). Stems end with `?`.

**Cognitive level.** Mostly application and analysis. Recall (pure definition/fact) ≤ ~20% of any file. Difficulty: pitched at a **newly certified consultant**. Hard items require integrating concepts or prioritizing among defensible actions — never trivia (no dates, no author-name matching for its own sake, no obscure numbers).

**Applied, not definitional.** Prefer "an athlete does X; which concept explains it / what do you do" over "which of these is the definition of X".

### No cueing

- Options are parallel in grammar and similar in length. The key must **not** systematically be the longest, the most qualified/hedged ("may", "often", "in most cases"), or the most specific option. Aim for the key to be the longest option in no more than ~30% of items; sometimes make it the shortest.
- No "all of the above", "none of the above", "both A and C", "A and B".
- Few negative stems (NOT/EXCEPT/LEAST) — at most 1 in 20, and capitalize the negative word if used.
- The "refer out" option is **not** usually the key. Use referral as the key only when the scenario clearly signals a concern outside CMPC scope or a competence limit; equally often include referral as a premature or unnecessary distractor.
- Don't repeat a distinctive word from the stem only in the key (clang associations).
- Balance answer positions: across a file, each of 0/1/2/3 is the key about 25% of the time (the app also shuffles options, but stored positions must still be balanced).
- No option that is absurd or obviously wrong. No "trick" via identity: a client's gender, race, disability, religion, sexuality, or nationality is never the hidden reason an answer is right.

### Distractor craft: make the stem necessary

Readers shown **only the options** guessed the first draft's keys 88–98% of the time (chance is 25%). Rewording distractors didn't help. What worked was this rule: **each option must be the best answer to some realistic nearby question.**

- For every distractor write one sentence: "This would be the key if the stem said ___." Change one or two realistic facts (timing, phase, consent status, role, data pattern, client preference). If you can't, replace the option.
- The stem holds the deciding fact, ideally one that needs an inference. It reads like a case note, not a list of exclusions, and never states the answer.
- Vary what wins. The key is often not the collaborative, exploratory, gather-more-data, or two-part option. It must still be good practice for this case.
- Good shapes: four legitimate techniques, instruments, theories or microskills; four next steps at different points in the sequence; four timings; four readings of the same data.
- Bad shapes: one right answer and three errors; one ethical answer and three lapses. When only one act is lawful, ask what comes first, whom to contact, what may be shared, or which limit applies.
- **Check with `node scripts/blind-check.mjs make <dir> --options-only`** and a fresh reader, with ids hidden. The validator's cue warnings are not enough.

### Variety

Spread across performance domains — team and individual sport, para sport, youth through elite and masters, performing arts (dance, music, theatre), tactical and first responders (military, police, firefighters, EMS), esports, business/executives, exercise and health — and across individual, team, organizational, and virtual delivery. Use diverse **fictional** names (no real athletes, teams, or public figures; fictional schools/clubs only). Don't reuse a name more than twice in a file. Avoid stereotypes.

### Safety and scope (these decide many answers)

- CMPCs who are not licensed mental-health professionals **don't diagnose or treat mental disorders**. They recognize warning signs, refer to appropriately licensed professionals, coordinate with medical staff (with consent), and follow emergency procedures when risk is imminent.
- Imminent risk (e.g., stated plan/intent for suicide, immediate danger) overrides the normal consulting sequence: stay with the person / ensure safety, follow the emergency action plan, contact emergency services or the designated crisis resource.
- Suspected abuse of a minor: follow mandatory reporting law and organizational policy — report promptly to child protective services or law enforcement, **and** to the U.S. Center for SafeSport when in the Olympic/Paralympic movement. Don't investigate, don't interview the alleged perpetrator, don't promise secrecy.
- MAAPP: one-on-one interactions with minor athletes must be **observable and interruptible** (exceptions such as emergencies aside).
- Concussion assessment and return-to-play decisions belong to the medical team.
- When you are unsure of a legal specific (a state's statute, a precise policy clause), write the item to test the **principle** instead.

### Rationales

- One rationale per option. The key's rationale explains why it is **best** and names the principle, theory, model, or Ethics Code standard. Each distractor's rationale explains specifically why it is not best (premature, out of scope, contradicts theory X, second-best because…).
- Refer to option **content**, never letters or positions ("Option B", "the third choice", "(C)") — options are shuffled.
- 1–3 sentences each. Plain, teaching tone.
- `takeaway`: one line, the transferable lesson.

### Certainty

If you aren't certain a fact is right, write the item around something you are certain of. Prefer well-established, textbook-level findings. Don't build an item on a contested finding unless the item is *about* the contest (e.g., stage/grief models of injury response are poorly supported).

## 4. Accuracy anchors

### AASP Ethics Code (2024)

Principles: Competence; Integrity; Professional and Scientific Responsibility; Respect for People's Rights and Dignity; Concern for Others' Welfare; Social Responsibility.

Standards that most often decide answers:
- Competence: practice within your competence; recognize mental-health concerns and refer.
- Titles: never call the CMPC a license; follow local rules on the title "psychologist."
- Testimonials: none from current clients.
- Multiple relationships: manage them carefully, including on social media. No sexual relationship with a former client for at least two years (and never with a current client).
- Barter and gifts: only under strict conditions (not clinically contraindicated, not exploitative).
- Third-party referrals (e.g., a coach or organization requests services for an athlete): clarify at the outset who the client is, the consultant's role, and where confidentiality ends.
- Fees: never contingent on future achievement (e.g., a cut of prize money or a bonus for winning).
- Informed consent: capacity, information, voluntariness, documentation. For minors: guardian permission **plus** the minor's assent.
- Confidentiality: discuss its limits up front, especially in group, team, and organizational work.
- Technology: verify the client's identity, use secure communication, and follow the laws where **both** parties are located.
- Assessments: use instruments validated for the population and language, ideally multi-method; obtain consent, give feedback, store results securely.
- Ethical conflicts with colleagues: informal resolution when confidentiality allows; consult a supervisor/mentor; the AASP Ethics Committee.

### Consulting sequence

Rapport and expectations → assessment → goals and planning → implementation → evaluation. "First step" questions follow this order unless safety overrides it.

### Frequently tested facts (use these accurately)

- Multidimensional anxiety theory: cognitive anxiety negatively linear with performance; somatic anxiety inverted-U; self-confidence positive linear.
- IZOF: optimal zones are individual and can sit at any intensity; can include positive and negative emotions.
- Catastrophe model: when cognitive anxiety is high, rising physiological arousal can produce a sudden, large performance drop (hysteresis — recovery isn't a simple reversal).
- Directional interpretation (Jones): the same intensity of anxiety symptoms can be read as facilitative or debilitative.
- Cue utilization (Easterbrook): rising arousal narrows attention — first dropping irrelevant cues (helpful), then relevant ones (harmful).
- Nideffer: attention has width (broad–narrow) and direction (external–internal): broad-external (assess the environment), broad-internal (analyze/plan), narrow-internal (rehearse/center), narrow-external (execute on a target).
- Achievement goal theory: task vs. ego orientation; mastery (task-involving) vs. performance (ego-involving) motivational climate.
- SDT: autonomy, competence, relatedness; regulation continuum amotivation → external → introjected → identified → integrated → intrinsic.
- Self-efficacy (Bandura): sources = performance accomplishments (mastery — strongest), vicarious experience, verbal persuasion, physiological/emotional states (plus imaginal experiences in later sport work).
- Attribution dimensions (Weiner): locus of causality, stability, controllability.
- Vealey's sport-confidence model (trait/state sport confidence, competitive orientation; later multidimensional sources of sport confidence).
- Carron: task vs. social cohesion; GEQ measures individual attractions to the group (task/social) and group integration (task/social). Tuckman: forming, storming, norming, performing (adjourning added later).
- Transtheoretical model: precontemplation, contemplation, preparation, action, maintenance. Theory of planned behavior: attitudes, subjective norms, perceived behavioral control → intention → behavior.
- Goals: outcome, performance, process. PETTLEP (Physical, Environment, Task, Timing, Learning, Emotion, Perspective). Paivio/Hall imagery functions: cognitive-specific (skills), cognitive-general (strategies), motivational-specific (goals), motivational-general-arousal, motivational-general-mastery.
- Self-talk: instructional for precision/fine-skill and learning tasks; motivational for strength/endurance/power tasks.
- Matching hypothesis: match the relaxation technique to the anxiety type (cognitive techniques for cognitive anxiety, somatic techniques for somatic anxiety).
- ACT processes: acceptance, cognitive defusion, present-moment contact, self-as-context, values, committed action. MAC (Gardner & Moore) applies mindfulness-acceptance-commitment to performance.
- Fitts & Posner stages: cognitive → associative → autonomous. Contextual interference: random/variable practice impairs acquisition performance but improves retention/transfer. Guidance hypothesis: frequent feedback aids acquisition but creates dependency; faded/reduced feedback improves retention. Deliberate practice: effortful, goal-directed, feedback-rich, not inherently enjoyable. DMSP: sampling (~6–12), specializing (~13–15), investment (~16+), or recreational path; deliberate play early.
- Stress–injury model (Andersen & Williams): personality, history of stressors, and coping resources → stress response (cognitive appraisal ↔ physiological/attentional changes) → injury risk; interventions target the appraisal and the physiological/attentional response. Wiese-Bjornstal's integrated model: pre-injury factors, then cognitive appraisal ↔ emotional response ↔ behavioral response, with personal and situational factors, cycling toward recovery outcomes. Stage/grief models of injury response are poorly supported.
- Chelladurai's multidimensional model: required, preferred, and actual leader behavior; congruence → performance and satisfaction. Transformational leadership. Mastery-oriented coach training (e.g., MAC/CET: positive reinforcement, mistake-contingent encouragement, technical instruction, reduced punitive behavior). Jowett's 3+1Cs: closeness, commitment, complementarity, (co-orientation).
- Kirkpatrick: reaction, learning, behavior, results.
- Motivational interviewing OARS: open questions, affirmations, reflections, summaries; change talk; rolling with/responding to sustain talk.
- Instruments: CSAI-2 (cognitive anxiety, somatic anxiety, self-confidence; state), SAS-2 (trait: somatic, worry, concentration disruption; youth & adult), TOPS (practice & competition strategies), TAIS (attentional and interpersonal style), ACSI-28 (coping skills), TEOSQ (task/ego orientation), GEQ (cohesion), SIQ (imagery use) / MIQ-3 (imagery ability), AIMS (athletic identity), POMS (mood states; iceberg profile).
- Overreaching (short-term, recoverable with rest) vs. overtraining syndrome (prolonged maladaptation, months). RED-S: low energy availability affecting health and performance (beyond the female athlete triad). Sleep: adults ~7–9 h; teens ~8–10 h. Prefrontal maturation continues into the mid-20s. Concussion belongs to the medical team.

### Role boundaries (scope comparisons)

CMPC: mental performance skills and education. Licensed clinicians (psychologists, counselors, social workers, psychiatrists): diagnosis and treatment of mental disorders. Athletic trainers / physicians / physical therapists: injury evaluation, treatment, rehab, return-to-play medical clearance. Strength and conditioning coaches: physical training programming. Registered dietitians: nutrition prescription and medical nutrition therapy. Executive coaches: leadership/organizational coaching (unregulated title). A CMPC may share general, evidence-based information in these areas but refers for assessment or prescription.

## 5. Concept card schema

```json
{
  "id": "card-g-izof",
  "kg": "G",
  "title": "Individual Zones of Optimal Functioning (IZOF)",
  "body": "80–170 words of original explanation in plain language.",
  "points": ["Up to 4 short bullet facts"],
  "examNote": "How this tends to show up on the exam (1–2 sentences).",
  "refs": ["hanin2000"]
}
```

Ethics cards use `"kg": "E"` and a `"category"` of `"ethics-principle"` or `"ethics-standard"`. They paraphrase; they never quote the Code.

## 6. Checks

Run `npm run validate` (whole bank) or `node scripts/validate-bank.mjs --file content/items/<file>.json` (one file). The validator checks structure, allocation/grid match, form overlap, drill depth, near-duplicates, cueing patterns, and that every ref resolves to the registry. Blind-check every new item: answer it without its key (ideally in a separate context); fix or replace any item where the blind answer disagrees or confidence is low.
