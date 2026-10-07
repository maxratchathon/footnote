---
name: aie-book
description: Answer questions about Chip Huyen's book "AI Engineering: Building Applications with Foundation Models" (O'Reilly, 2025) and connect them to the FootnoteRAG project. Use whenever the user mentions "the book", "AI Engineering book", Chip Huyen, a chapter number, or asks what the book says about a topic (RAG, chunking, embeddings, evals, prompt engineering, agents, finetuning, guardrails, caching, etc.) or which chapter to read for the current stage.
---

# AI Engineering book companion

The user is learning AI engineering by building FootnoteRAG and reading Chip Huyen's *AI Engineering: Building Applications with Foundation Models* alongside it. Every answer has two jobs: say **where and how the book covers the topic**, and say **how it helps them learn in this project**, right now.

## Steps

1. **Start from the map.** Read `references/book-map.md`: the verified table of contents (every chapter and section) and how each part maps onto FootnoteRAG's stages and files. Find the chapter and section(s) that cover the topic.

2. **Research before answering.** Don't answer from memory alone. Look up what the book says about the specific topic:
   - The official companion repo first: https://github.com/chiphuyen/aie-book. Use `ToC.md`, `chapter-summaries.md`, `study-notes.md`, `resources.md`, `case-studies.md` and `prompt-examples.md` (fetch the raw files from `raw.githubusercontent.com/chiphuyen/aie-book/main/<file>`).
   - Then, if needed, the author's blog (huyenchip.com), the O'Reilly book page, and reputable reviews or reading notes for the topic.
   - If sources disagree, or you can't confirm a detail, say so rather than guess.

3. **Check where the project is.** Read `docs/plans/overview.md` (stage status) and any code the topic touches, so the project connection is concrete: real files, real data, real past bugs.

4. **Reply in this shape:**

   **Where the book covers it**: chapter number and title > section title(s), taken from the ToC. Mark anything inferred rather than confirmed.

   **What the book says**: the key ideas, paraphrased in a few bullets. Name the concepts and techniques so the user can look them up.

   **How this helps you in FootnoteRAG**:
   - which stage or file it applies to (e.g. `lib/retrieve.ts`, Stage 3)
   - what we already did that illustrates it (e.g. the Thai tokenizer bug for Ch. 2 "Multilingual Models")
   - one concrete thing to try or measure in the project to understand it by doing, ideally checkable with the Stage 2 eval score once it exists

   **Read next**: the one or two sections worth reading now, given the current stage.

   **Sources**: links used.

## Rules

- **Copyright:** never reproduce the book's text. Paraphrase in your own words. At most one direct quote per answer, under 15 words, attributed. Don't reconstruct chapters from excerpts across answers. Don't invent page numbers.
- **Verified vs inferred:** the ToC and chapter list in `references/book-map.md` are verified (from the official repo, 2026-10-07). Anything more specific (exact claims, recommendations, numbers) needs a source from step 2, or a clear "I believe…, not verified".
- **Keep it tied to the project.** The goal is learning by building, not a book summary. If a topic is outside the project's scope (e.g. finetuning, Ch. 7), say so and explain how it relates to RAG instead.
- The user may write in Thai or English; answer in the language they use.
- If the user means a different book, ask which one.
