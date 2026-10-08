# Changelog

A dated log of what changed, what it taught, and where work stopped. Newest first. Detailed steps live in the stage plans in `docs/plans/`; this file is the short version to read when coming back to the project.

Rule for entries: no corpus content (the real corpus is private and git-ignored), so describe questions and sections, don't quote them.

---

## Resume here

**Stage 2 (evals), paused on 2026-10-08.** `pnpm eval` works and is committed. Next, in order:

1. **Rewrite the questions** in `corpus/evals.json` in your own words. Change only the `question` text, keep `expected`, then run `pnpm eval --no-save` to check the labels still match. The draft set scores 100% at hit@5, which is too easy to show any improvement.
2. Re-run the chunk-size comparison (600 / 1200 / 2000) on the rewritten set, and record it in the Results table of `docs/plans/stage-2-evals.md`.
3. Step 6 of the plan: answer checks (does the model refuse unanswerable questions and cite the right section?).
4. Before pushing: decide whether `docs/plans/stage-2-evals.md` may quote small pieces of the corpus (a few Thai terms and one sample question). If not, replace them with neutral wording.

Optional: a short, simple version of the eval guide artifact (Thai or English). The current one is too dense.

---

## 2026-10-08: Stage 2 evals, first working version

**Changed**
- Ingest re-chunks a file when `EMBED_MODEL`, `targetChars` or `maxChars` change. Before, it only checked the file's content, so changing chunk sizes left stale chunks and evals would have scored the old settings. (`Fix(ingest)`)
- New `pnpm eval [file] [--note "…"] [--no-save]`: retrieves the top 10 chunks for each test question, finds the rank of the right chunk, and reports hit@1/3/5/10 and MRR, the misses, and every question whose rank changed since the last run. Each run is saved in the new `eval_runs` table. (`Add(evals)`)
- 48 draft test questions in `corpus/evals.json` (git-ignored): 28 Thai, 20 English, 4 with no answer in the corpus.

**Learned**
- **An eval is an exam for the search step.** Each question has an answer key (which section holds the answer); the score is how often the right chunk lands in the top 5, since only 5 chunks reach the model.
- **Labels must not change meaning when the thing being tested changes.** Section-only labels got more lenient as chunks got smaller (any piece of the section counted), which faked a +2.3 pt gain at 600 chars. Fix: every label is a section plus a short `evidence` string from the answer.
- **The corpus repeats facts** (main sections, appendix summaries, FAQ), so a label lists every place that answers the question.
- **Small differences are noise.** With 44 questions, one question is about 2 points. Compare runs question by question, and look at *why* a question moved.
- **The draft questions were too easy:** written from the document's own wording, so search matches them easily. Real phrasing is harder.
- **Big chunks dilute short answers.** A short FAQ answer fell from rank 2 to rank 10 when merged into a 2000-char chunk.
- **"Further reading" link lines become junk chunks** of mostly URL text. A candidate fix for the chunking experiments.
- English questions over the Thai text did as well as Thai ones (bge-m3 matches across languages).

**Results (draft questions):** hit@5 was 100% at 1200 and 600, 97.7% at 2000. No setting is clearly better, so `targetChars` stays 1200. Full table in `docs/plans/stage-2-evals.md`.

**Also:** an eval guide artifact (private): https://claude.ai/artifact/NahnUL9db6u7mq2CyEtDVf

---

## 2026-10-07: Stage 1 basic RAG, done

**Changed**
- Next.js app with Postgres + pgvector (port 5433), plain SQL via `pg`.
- `pnpm ingest`: Markdown chunking at headings and paragraphs, embeddings through Ollama, idempotent re-runs.
- Question flow: embed → top-5 vector search → prompt with numbered sources → streamed answer with `[n]` citations, a citation check after streaming, and one `traces` row per question.
- Switched embeddings from `nomic-embed-text` to `bge-m3`.
- Added the AI Engineering book companion skill.

**Learned**
- **The embedding model must read the corpus language.** `nomic-embed-text` turned every Thai string into the same vector, so search was silently random: no errors anywhere. This is the case for evals: one test question would have caught it.
- On the sample corpus, the right section ranked 4th for a paraphrased question: top 5 rescued it, top 3 would have missed it. The first sign that retrieval needs measuring.
