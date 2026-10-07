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

1. **Basic RAG**: ingest Markdown and plain text (chunk, embed, store); question flow (embed question, top-k by cosine, build prompt, stream answer with working citations).
2. **Evals**: a JSON file of 30–50 questions with expected source document/chunk; one command reports retrieval hit rate (expected source in top-k?); each run is stored in Postgres so runs can be compared.
3. **Better retrieval**: hybrid search with Postgres full-text search, then reranking and query rewriting. **Keep a change only if the Stage 2 score improves.**
4. **Agent loop**: hand-written tool-calling loop (tools: search corpus, fetch full document), with an iteration cap and tool-error handling.
5. **Production concerns**: fill `traces` on every request plus a simple trace viewer; per-request cost and latency; embedding caching; basic prompt-injection guardrails for document content.

## Decisions

1. **Model provider**: local models via Ollama for both chat and embeddings. The embedding model sets `DIM`, and swapping models means re-embedding the corpus.
2. **Corpus**: the user's own docs (Markdown/plain text), placed in the git-ignored `corpus/` folder. Chosen because the chat model has never seen them, so a correct answer must come from retrieval and citations can be checked. Never commit corpus content.
3. **Frontend**: Next.js.

## Commands

Package manager is **pnpm**. Copy `.env.example` to `.env` first (scripts load it via `tsx --env-file`; Next.js loads it itself).

```sh
pnpm db:up                           # Postgres + pgvector via docker compose
pnpm db:migrate                      # apply db/migrations/*.sql not yet in schema_migrations
ollama pull nomic-embed-text         # embedding model (EMBED_MODEL)
ollama pull llama3.1:8b              # chat model (CHAT_MODEL)
pnpm ingest [folder]                 # chunk + embed + store; default folder is corpus/
pnpm ingest sample-corpus --dry-run  # show chunking only, no Ollama or DB needed
pnpm dev                             # Next.js app
pnpm typecheck
```

There is no test runner yet; Stage 2 evals will be the main quality check.

## Code layout

- `lib/`: shared by the Next.js app and the scripts. `config.ts` (env + tunables such as chunk sizes), `db.ts` (pg pool), `ollama.ts` (embedding via Ollama's HTTP API with plain `fetch`, no SDK), `chunk.ts` (Markdown chunker).
- `scripts/`: CLI entry points run with `tsx` (`migrate.ts`, `ingest.ts`).
- `db/migrations/`: plain SQL. `{{EMBED_DIM}}` is substituted from `EMBED_DIM` by the migration runner.
- `sample-corpus/`: invented docs for a fictional company (Halyard Labs, product Tidewater) for smoke tests. Too small for evals. The real corpus goes in the git-ignored `corpus/`.

## Retrieval details that span files

- nomic-embed-text needs task prefixes: `search_document: ` when ingesting and `search_query: ` for questions (`lib/ollama.ts`). The question flow must use `"search_query"`.
- Chunks never cross headings, are packed by paragraph up to `targetChars`, and start with a heading breadcrumb (`Title > Section > Subsection`). The stored `content` is exactly the embedded text, which is also what a citation shows.
- Ingestion is idempotent: keyed by `source_path` (unique), unchanged hashes are skipped, changed files are replaced whole, and files deleted from the folder are removed from the DB.
