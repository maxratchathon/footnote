# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

FootnoteRAG: chat with your docs, with every answer cited. A RAG system built from scratch on React, Node.js and Postgres (pgvector).

This is a **learning project for AI engineering**. The point is to understand each part of a RAG system by building it, so clarity beats speed or features. Explain the reasoning behind retrieval and prompt decisions as you make them.

## Ground rules

- **No LLM framework** (no LangChain, LlamaIndex or similar). Call the model provider's SDK directly.
- Chunking, retrieval, prompt assembly and the agent loop are written by hand.
- **Ask before adding any dependency.** A thin library for streaming to the UI is fine.
- Work in small steps. Finish and verify each build stage before starting the next, and stop for review where a stage says so.
- **Every answer must cite its sources.** An answer without citations is a bug.
- If the retrieved chunks don't contain the answer, the model must say so instead of guessing.
- Commit subject format: `Verb(scope): lowercase summary`, e.g. `Add(landing-page): basic ui scaffold`. The verb is capitalized (`Add`, `Fix`, `Update`, `Remove`, `Refactor`), and the scope is the area touched, such as `ingest`, `chunking`, `db` or `chat-ui`.
- Commit messages must not include a `Co-Authored-By` trailer or any other AI attribution line.
- Out of scope for now, on purpose: separate vector database, job queue, auth, PDF parsing.

## Stack

- Next.js + TypeScript: one app serving both the UI and the API route handlers (chosen over the Vite SPA + separate API). Ingestion and evals run as standalone scripts, not inside the server.
- LLM and embeddings run locally through Ollama's HTTP API (no hosted provider)
- Postgres with pgvector, accessed with plain SQL via `pg` (no ORM)
- Answers stream to the UI over server-sent events
- Local dev: `docker-compose.yml` runs a Postgres image with pgvector

## Data model

Three tables (see the migration for the exact schema):

- `documents`: one row per ingested file (`title`, `source_path`, `content_hash` for change detection).
- `chunks`: `document_id`, `chunk_index`, `content`, `embedding vector(DIM)`, with an HNSW index using `vector_cosine_ops`. Retrieval is top-k by cosine distance.
- `traces`: one row per question (question, retrieved chunk ids, full prompt, answer, token counts, latency) for debugging and cost tracking.

The embedding dimension depends on the embedding model. **Keep it in config, never hardcoded** in code or SQL outside the migration that reads it.

## Citation contract

The prompt numbers the retrieved chunks; the model answers with markers like `[1]`, and each marker maps back to a chunk id. The UI shows the source chunk for each marker. Any change to prompt assembly, streaming or the UI must keep this mapping intact.

## Build stages

The roadmap, with each stage's learning purpose and done criteria, is in `docs/plans/overview.md`; each stage gets a detailed plan next to it. In short: 1 basic RAG, 2 evals, 3 better retrieval, 4 agent loop, 5 production concerns. Finish and verify a stage before starting the next. In Stage 3, **keep a change only if the Stage 2 score improves.**

## Decisions

1. **Model provider**: local models via Ollama for both chat (`qwen2.5:7b`) and embeddings (`bge-m3`, replaced `nomic-embed-text`, which cannot read Thai). The embedding model sets `DIM`, and swapping models means re-embedding the corpus.
2. **Corpus**: the user's own docs (Markdown/plain text), placed in the git-ignored `corpus/` folder. Chosen because the chat model has never seen them, so a correct answer must come from retrieval and citations can be checked. Never commit corpus content.
3. **Frontend**: Next.js.
4. **DB access stays plain SQL via `pg`** (Prisma and Drizzle were considered). Prisma has no pgvector type, and Stage 3's hybrid search needs SQL that ORMs handle poorly. Reading the SQL is part of the learning goal, so explain each new query in plain language when adding it.

## Commands

Package manager is **pnpm**. Copy `.env.example` to `.env` first (scripts load it via `tsx --env-file`; Next.js loads it itself).

```sh
pnpm db:up                           # Postgres + pgvector via docker compose
pnpm db:migrate                      # apply db/migrations/*.sql not yet in schema_migrations
pnpm db:reset-embeddings             # after changing EMBED_MODEL/EMBED_DIM: clear docs, resize vector column, then re-ingest
ollama pull bge-m3                   # embedding model (EMBED_MODEL), multilingual incl. Thai
ollama pull qwen2.5:7b               # chat model (CHAT_MODEL)
pnpm ingest [folder]                 # chunk + embed + store; default folder is corpus/
pnpm ingest sample-corpus --dry-run  # show chunking only, no Ollama or DB needed
pnpm ask "question"                   # full question flow in the terminal (no UI)
pnpm dev                             # Next.js app (API: POST /api/ask, streams SSE)
pnpm typecheck
```

There is no test runner yet; Stage 2 evals will be the main quality check.

## Code layout

- `lib/`: shared by the Next.js app and the scripts. `config.ts` (env + tunables such as chunk sizes), `db.ts` (pg pool), `ollama.ts` (embedding via Ollama's HTTP API with plain `fetch`, no SDK), `chunk.ts` (Markdown chunker), `retrieve.ts` (top-k vector search), `prompt.ts` (rules + numbered sources), `ask.ts` (whole question flow as an async generator of events; route and CLI are thin wrappers), `citations.ts` (marker parsing, shared by server check and UI).
- `scripts/`: CLI entry points run with `tsx` (`migrate.ts`, `ingest.ts`, `ask.ts`).
- `lib/ask-events.ts`, `lib/citations.ts` and `lib/prompt.ts` are imported by the client page, so they must stay free of server-only imports (`pg`, `config`).
- `db/migrations/`: plain SQL. `{{EMBED_DIM}}` is substituted from `EMBED_DIM` by the migration runner.
- `sample-corpus/`: invented docs for a fictional company (Halyard Labs, product Tidewater) for smoke tests. Too small for evals. The real corpus goes in the git-ignored `corpus/`.
- `docs/plans/`: `overview.md` (roadmap and status table, keep it current) plus one implementation plan per piece of work, with checkboxes. Read the relevant plan before starting, tick items off as they are done, and update its status line.

## Retrieval details that span files

- Answers are checked after streaming: status `cited`, `refusal` (exactly the `REFUSAL` sentence in `lib/prompt.ts`), `uncited` or `invalid` (a marker outside 1..k). The UI shows a warning for the last two; never hide them.
- Ollama chat runs with an explicit `num_ctx` (`config.chat.contextTokens`): Ollama silently truncates prompts beyond its context window, dropping the system rules first.
- **The embedding model must cover the corpus language.** The real corpus is Thai. `nomic-embed-text` has an English-only tokenizer: every Thai string embedded to the same vector, so search was silently random (ingest and search raised no errors). Use a multilingual model (`bge-m3`, 1024 dims) and check new models on Thai text before trusting them.
- Task prefixes are per model (`PREFIXES` in `lib/ollama.ts`; nomic needs `search_document: `/`search_query: `, bge-m3 needs none). Callers pass `"document"` or `"query"`.
- Switching embedding models means `pnpm db:reset-embeddings` and re-ingesting everything. Never mix vectors from two models.
- Ingest's skip-if-unchanged hash covers the file content plus `EMBED_MODEL`, `targetChars` and `maxChars`, so changing any of them re-chunks and re-embeds on the next `pnpm ingest` (needed for evals to score the current settings). A dimension change still needs `db:reset-embeddings` first.
- Chunks never cross headings, are packed by paragraph up to `targetChars`, and start with a heading breadcrumb (`Title > Section > Subsection`). The stored `content` is exactly the embedded text, which is also what a citation shows.
- Ingestion is idempotent: keyed by `source_path` (unique), unchanged hashes are skipped, changed files are replaced whole, and files deleted from the folder are removed from the DB.
