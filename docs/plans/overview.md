# FootnoteRAG roadmap

FootnoteRAG is a learning project: each stage exists to teach one part of how a RAG system works, by building it by hand. This file is the map. Each stage gets its own detailed plan in this folder when it starts.

| Stage | Topic | Status | Detailed plan |
|---|---|---|---|
| 1 | Basic RAG | In progress: ingestion done, question flow planned | [stage-1-question-flow.md](stage-1-question-flow.md) |
| 2 | Evals | Not started; needs the real corpus | — |
| 3 | Better retrieval | Not started | — |
| 4 | Agent loop | Not started | — |
| 5 | Production concerns | Not started | — |

Finish and verify each stage before starting the next. Later stages depend on earlier ones: Stage 3 is judged by Stage 2's score, and Stage 5 instruments everything built before it.

---

## Stage 1: Basic RAG

**Learning purpose:** understand the core loop every RAG system is built on, and why each step exists.

- **Chunking:** why documents are split at all (embedding models have context limits, and a small chunk matches a question more precisely than a whole document), and how the place you cut changes what can be found.
- **Embeddings:** text becomes a vector that captures meaning, so "paged at 3am" can match "outside your working hours" without sharing any words. You also learn the limits: similar meaning is not the same as answering the question.
- **Vector search:** cosine distance, top-k, and what an HNSW index does (fast approximate search instead of comparing against every chunk).
- **Grounding:** a prompt that makes the model answer only from the sources, cite them, and refuse when they don't contain the answer.
- **Streaming:** how tokens get from the model to the browser as they are generated.

**What we build**
- Part 1, done: `pnpm ingest` reads Markdown/text, chunks it at headings and paragraphs, embeds the chunks with `nomic-embed-text` and stores them in pgvector. Re-running it only processes changed files.
- Part 2, planned: question → embed → top-k → prompt → streamed answer with `[n]` markers that open their source chunk in the UI. Each question is logged in `traces`.

**Done when:** a question about the corpus returns a streamed answer with working citations, and an off-topic question gets a refusal instead of a guess.

**Observed so far:** "What happens if I get paged at 3am?" found the right document but not the right section (`On-call > Pay`). This is the first concrete retrieval miss, and it motivates Stages 2 and 3.

---

## Stage 2: Evals

**Learning purpose:** learn to *measure* retrieval instead of judging it by eye. Without a score, every later "improvement" is a guess, and changes that look better on one question often get worse on average.

- **Retrieval hit rate (recall@k):** for each question, is the expected source in the top k? This isolates retrieval from generation: if the right chunk never reaches the prompt, no prompt fixes the answer.
- **Building a test set:** writing questions the way a real user would phrase them (not copying the doc's wording, which makes retrieval look better than it is), and covering easy, hard and unanswerable cases.
- **Comparing runs:** one change at a time, stored results, and noticing when a difference is too small to mean anything with 30–50 questions.

**What we build**
- A JSON file of 30–50 questions, each with the expected source document or chunk.
- One command that runs every question and reports the hit rate at k.
- An `eval_runs` table (via a new migration) recording each run's settings and score, so runs can be compared.

**Depends on:** the real corpus. Evals on 11 invented files would not tell us much; questions must be about documents large and varied enough for retrieval to fail sometimes.

**Done when:** one command gives a score, and a change to chunking (e.g. `targetChars`, or adding overlap) visibly moves it.

---

## Stage 3: Better retrieval

**Learning purpose:** learn why vector search alone misses things, which fixes exist, and to keep only what the Stage 2 score says helps.

- **Lexical vs semantic search:** embeddings are good at paraphrase but weak at exact terms (error codes, product names, CLI flags like `--workspace`). Keyword search is the opposite. Postgres full-text search (`tsvector`, `ts_rank`) covers the keyword side.
- **Hybrid search:** running both and merging the rankings, e.g. with reciprocal rank fusion, which merges by rank position so the two different score scales never have to be compared.
- **Reranking:** retrieve more candidates cheaply (say 20), then score each one against the question with a slower, more precise model and keep the best 5. This trades latency for precision.
- **Query rewriting:** having the LLM rephrase or expand the question before searching ("paged at 3am" → "on-call page outside working hours"). It helps vague questions, adds a model call, and can drift from what the user meant.

**What we build:** hybrid search, then reranking, then query rewriting, each as a separate experiment against the Stage 2 score.

**Rule:** keep a change only if the Stage 2 score improves. Record the result either way; a technique that didn't help is still a finding.

---

## Stage 4: Agent loop

**Learning purpose:** understand what an "agent" actually is underneath the frameworks: a loop in which the model chooses tools, our code runs them, and the results go back to the model until it answers.

- **Tool calling:** describing tools to the model, parsing its tool calls, and feeding results back in. All by hand, with no framework.
- **When an agent beats single-shot RAG:** questions that need several searches ("compare the Team and Studio plans' version history"), or a full document rather than a chunk.
- **Failure modes:** infinite loops, repeated identical searches, tool errors, and cost growing with every iteration. This is also where a 7B local model's limits show most clearly.

**What we build**
- A hand-written loop with two tools: `search_corpus(query)` and `fetch_document(id)`.
- A cap on iterations, and tool errors returned to the model as results instead of crashing the loop.
- Citations still required: every claim must trace back to a chunk or document the agent actually fetched.

**Done when:** a multi-part question gets answered through several tool calls with correct citations, and the loop stops cleanly at the cap.

---

## Stage 5: Production concerns

**Learning purpose:** learn what it takes to run and debug a RAG system, rather than just demo it.

- **Observability:** a trace of every request (question, retrieved chunks, exact prompt, answer, tokens, latency) is how you answer "why did it say that?". Most RAG bugs are found by reading traces.
- **Cost and latency:** where the time goes (embedding, search, generation) and which parts dominate. Running locally, cost is measured in tokens and seconds rather than dollars, but the reasoning carries over to hosted APIs.
- **Caching:** skipping work that has already been done, such as re-embedding identical text or repeated questions, and when a cache returns stale results.
- **Prompt injection:** documents are untrusted input. A doc containing "ignore previous instructions" must not change the model's behaviour. You learn which defences help (delimiting, instructions about data vs commands, output checks) and that none is complete.

**What we build**
- `traces` filled on every request (Stage 1 already starts this), plus a simple trace viewer page.
- Per-request latency breakdown and token counts.
- An embedding cache.
- Basic prompt-injection guardrails, tested with a deliberately malicious document added to the sample corpus.

**Done when:** any past answer can be opened in the trace viewer and explained from its trace, and the injection test document cannot change the model's behaviour.

---

## Out of scope for now

On purpose, to keep attention on retrieval and prompting: a separate vector database, a job queue, auth, PDF parsing, and any LLM framework.
