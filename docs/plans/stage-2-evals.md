# Stage 2: retrieval evals

**Status:** in progress: steps 1, 3, 4 done; step 2 questions await your rewrite; step 5 run on the draft questions (2026-10-08)
**Depends on:** Stage 1 (done). Corpus: one Thai rental-room guide in `corpus/my-diary/` (93 chunks; sections 1–18 plus appendices ก/ข (19–20), an FAQ (21) and a changelog (22)).

Goal: one command gives a retrieval score for the current settings, stores it, and shows what changed since the last run. A chunking change (e.g. `targetChars`) must visibly move the score.

This stage measures **retrieval only**: is the chunk that answers the question among the top k? Generation (does the model use the chunk, cite it, refuse when it should?) is a separate question, covered as an optional last step.

## Design decisions

### What counts as "the expected source"

The corpus is a single document, so "expected document" would make every question a hit. Chunk ids and `chunk_index` change on every re-ingest and every chunking change, so they can't be used either. The label has to **survive re-chunking**, because comparing chunking settings is the point of this stage.

So each question names the **section** that answers it, as its heading number (e.g. `"12.2"`). A retrieved chunk is a hit if its breadcrumb (`Title > 12. ภาษี… > 12.2 ภาษีเงินได้จากค่าเช่า`) contains that section. Every chunk starts with its breadcrumb, so this works for any chunk size.

- `expected` is a list: a hit on any of them counts. The corpus repeats many facts: the deposit limit is in 11, the appendix summary ก.3, the lease template ข.1 and FAQ Q2. Every copy must be listed, or retrieving the FAQ copy would be wrongly scored as a miss.
- A label matches a breadcrumb segment that starts with it: `"12.2"` → `12.2 ภาษี…`, `"21"` → `21. คำถามพบบ่อย…`, `"ก.3"` → `ก.3 ประกาศ สคบ.…`, `"ระยะ ค."` → the third checklist phase.
- Every item is `{ "section": "11", "evidence": "เงินประกันไม่เกิน 1 เดือน" }`: the chunk must be in that section **and** contain the evidence, a short substring of the answer. A bare `"11"` is accepted but warned about.

Why evidence on every label, learned the hard way: the first version used bare sections and evidence only for sections that were split at 1200. At `targetChars` 600, 19 more labels covered split sections, so *any* chunk of the section counted, and the score rose (+2.3 pts hit@1) purely because the labels got more lenient as chunks got smaller. That bias would have made smaller chunks look better in every comparison. With evidence everywhere, the hit@1 gain disappeared. Keep evidence strings short so a chunk boundary can't split one.

### Metrics

Retrieve once per question at k = 10 and compute everything from that one ranking:

- **hit@1, hit@3, hit@5, hit@10** (recall@k with one relevant section): the share of questions whose expected section appears in the top k. hit@5 is the headline number because `topK = 5` is what reaches the prompt.
- **MRR** (mean reciprocal rank): the average of 1/rank of the first hit, or 0 on a miss. It rewards moving the right chunk from 4th to 1st, which hit@5 can't see. Exactly the "On-call > Pay ranked 4th" case from Stage 1.

### Noise

With 40 questions, one question is 2.5 points. Every run report includes the questions that **flipped** (hit→miss, miss→hit) against the previous run, so a +2.5 change can be read as "one question" rather than taken as a trend. Rule of thumb for Stage 3: a change of fewer than 3 flipped questions is noise unless the flips are explainable.

### Re-ingesting after a chunking change (bug fix this stage needs)

`pnpm ingest` skips a file when its content hash is unchanged. After changing `targetChars`, the file *is* unchanged, so the old chunks would stay and the eval would score the old settings. The same blind spot is documented for embedding-model swaps.

Fix: the stored hash covers the file **and** the settings that shape its chunks: `sha256(raw + embedModel + targetChars + maxChars)`. Changing any of them re-chunks and re-embeds the file. This also closes the documented same-dimension model-swap gap. (A dimension change still needs `db:reset-embeddings`.)

### Where the questions live

Questions about a private corpus leak its content, and corpus content is never committed. So:

- `corpus/evals.json` (git-ignored with the rest of `corpus/`): the real test set.
- `evals/sample.json` (committed): ~8 questions on `sample-corpus/`, so the eval command can be smoke-tested without the private corpus.

## Steps

### 1. Ingest hash covers chunking settings

- [x] Include `embedModel`, `targetChars`, `maxChars` in the hash in `scripts/ingest.ts`.
- [x] Verify: run ingest twice (second run skips everything), change `targetChars`, run again (re-chunks), change it back. Result: 1200 → 93 chunks, skipped on re-run; 600 → 118 chunks; back to 1200 → 93.
- [x] Update the CLAUDE.md note on same-dimension model swaps.

Side finding: the largest chunk is 2041 chars, over `maxChars` (2000). The breadcrumb prefix is probably added after the size check. Harmless for now (well under bge-m3's context), noted for the chunking experiments in step 5.

### 2. Test set format and the questions

```json
[
  { "id": "tax-rental-income", "question": "รายได้ค่าเช่าต้องเสียภาษีเงินได้ยังไง", "expected": ["12.2"], "tags": ["th", "direct"] },
  { "id": "opportunity-cost", "question": "Is building rooms better than leaving money in a deposit?", "expected": ["14.2", "14.3"], "tags": ["en", "paraphrase"] },
  { "id": "no-answer-pets", "question": "Can tenants keep dogs?", "expected": [], "tags": ["unanswerable"] }
]
```

- [x] Draft questions across all sections: 48 in `corpus/evals.json` (44 answerable, 4 unanswerable).
- [ ] **You review and rewrite** them in your own words: questions copied from the doc's wording score better than real users' phrasing would. Re-run the label check (step 4) after editing.
- [x] Mix: 28 Thai, 20 English (cross-language retrieval with `bge-m3`), 4 unanswerable.
- [x] Tags for difficulty: `direct` (uses the doc's terms), `paraphrase` (different words, same meaning), `number` (asks for a figure such as a fee or rate), `multi` (answer combines sections).
- [x] Include the regression case from Stage 1: ค่าเสียโอกาส → 14.2.
- [x] Unanswerable questions (`expected: []`) are skipped by the retrieval score; they are there for step 6.
- [x] Every label has evidence and matches at 600, 1200 and 2000 chars (`pnpm eval` checks this before scoring).

Findings from labelling, to test in step 5:

- **Link-only chunks.** Each `อ่านเพิ่มเติม` (further reading) line of long percent-encoded URLs becomes a chunk of its own (chunks 19, 49, 63: about 1,000–1,500 chars, almost all URL). It wastes a retrieval slot if it ranks, and inflates the section-only score. Candidate fix: strip or shorten link URLs before chunking.
- **Distractor chunks.** The table of contents (chunks 1–2) and the changelog (chunk 91) mention nearly every section by name, so they may outrank the real content for short questions.

### 3. Eval runs table: `db/migrations/002_eval_runs.sql`

- [x] `eval_runs`: `id`, `created_at`, `question_set` (file name), `question_set_hash` (runs on different question sets must not be compared), `note`, `settings jsonb` (embed model, chunk sizes, k, chunk count, git commit), `n_questions`, `hit_at_1/3/5/10`, `mrr`, `results jsonb` (per question: rank of first hit, top-10 chunk ids and sections).
- [x] Per-question results live in the row so later runs can compute rank changes without re-running old settings.

### 4. Eval command: `scripts/eval.ts`, `lib/eval.ts`

- [x] `pnpm eval [file] [--note "…"] [--no-save]` (default `corpus/evals.json`): retrieve top 10 for each question, find the rank of the first hit, compute the metrics, insert an `eval_runs` row. Takes ~6 s for 48 questions.
- [x] Reuse `retrieve()` from `lib/retrieve.ts`, so evals test exactly what the app runs.
- [x] Validate the file first: every label must match a stored chunk (error), and labels without evidence are warned about. A typo in a label otherwise scores as a retrieval miss.
- [x] Report: the metrics with deltas, hit@5 per tag, the misses (question, expected, top 3 sections retrieved), and every rank change against the previous run of the same file. Every rank change, not only flips across k, because hit@5 sits at 100% on the draft set and only ranks show movement.
- [x] Also reported: mean distance of the nearest chunk for answerable vs unanswerable questions (0.356 vs 0.484). There is a gap, which is a hint that a distance cutoff might help refusals. Worth testing in step 6, not assuming.
- [ ] `evals/sample.json` for `sample-corpus/`: deferred. Only the Thai corpus is ingested, and ingesting both would put each corpus's chunks into the other's results. Decide whether it's worth it once the real set is settled.

### 5. Prove it moves (done criterion)

- [x] Baseline run with current settings (`targetChars` 1200).
- [x] Change `targetChars` (try 600 and 2000), re-ingest, eval, and record all three in a results table at the bottom of this plan.
- [ ] Redo all three on your rewritten questions; the draft set is too easy (see Results).
- [ ] Write down what the misses have in common. That list is the input to Stage 3.

### 6. Optional: answer checks

- [ ] `pnpm eval --answers`: also runs the full `ask` flow and records the citation status per question. Checks: unanswerable questions get `refusal`; answerable ones get `cited`, and at least one cited chunk is in the expected section.
- [ ] Slower (one 7B generation per question), so it's opt-in.

## Results

### Draft questions (48, Claude-written), bge-m3, maxChars 2000

| Run | targetChars | Chunks | hit@1 | hit@3 | hit@5 | hit@10 | MRR |
|---|---|---|---|---|---|---|---|
| 3 | 1200 (current) | 93 | 84.1% | 95.5% | **100%** | 100% | 0.902 |
| 4 | 600 | 118 | 84.1% | 100% | **100%** | 100% | 0.913 |
| 5 | 2000 | 89 | 86.4% | 97.7% | **97.7%** | 100% | 0.915 |

What it shows:

- **The score moves with chunk size** (done criterion), but every difference is one or two questions out of 44, at the noise level. No setting is clearly better on this set, so `targetChars` stays at 1200.
- **The draft set is too easy.** hit@5 is at 100%, so it can only get worse, and Stage 3 changes couldn't show a gain. The questions reuse the document's own terms (ส.ป.ก., ตม.30, ค่าเสียโอกาส), which embeddings match easily. Harder, real-user phrasing is the fix.
- **The one real miss is instructive.** "สร้างแล้วกี่ปีถึงจะได้เงินคืน" (how many years to get my money back) needs ระยะคืนทุน (payback period). It was rank 4 at 1200, rank 2 at 600, and fell to rank 10 at 2000, where the FAQ answer is merged into a big chunk with 5 other Q&As. Bigger chunks dilute a short answer's embedding: the same trade-off Stage 1 saw with "paged at 3am".
- English questions over Thai text did as well as Thai ones (18/18 at hit@5), so cross-language retrieval with bge-m3 is not the weak spot on this set.
