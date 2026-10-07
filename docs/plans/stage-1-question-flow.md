# Stage 1, part 2: question flow

**Status:** planned, not started
**Depends on:** ingestion (done: 47 chunks from `sample-corpus/` in Postgres)

Goal: a question typed in the browser streams back an answer whose `[n]` markers each open the source chunk they came from. Questions the corpus does not answer get an explicit refusal, not a guess.

## Steps

### 1. Retrieval: `lib/retrieve.ts`

- [ ] Embed the question with the `search_query:` prefix (ingestion used `search_document:`).
- [ ] Fetch the top `k = 5` chunks by cosine distance (`<=>`), joined with their document's title and path.
- [ ] Return each chunk's distance as well.

Why `k = 5`: enough to bring in a useful second chunk (e.g. the 4.2 release note about crashed-agent locks alongside the main locking section) without burying a 7B model in text. `k` lives in `lib/config.ts` so Stage 2 evals can tune it.

No distance cutoff yet: the model decides whether the sources answer the question. Distances are logged in the trace so we can later check whether a cutoff would help.

### 2. Prompt assembly: `lib/prompt.ts`

- [ ] **System message** with the rules: answer only from the sources; put a marker like `[2]` after every claim; if the sources do not contain the answer, reply with exactly `The documents don't cover this.`
- [ ] **User message**: the sources numbered `[1]`…`[k]`, each in a `<source n="…" title="…" path="…">` tag, then the question.
- [ ] Keep the `[n]` → chunk id mapping next to the prompt; it is the citation contract.

The tags mark document text as data, not instructions: a first step toward the Stage 5 prompt-injection guardrails.

### 3. Chat call: `lib/ollama.ts`

- [ ] Add a streaming `chat()` that calls Ollama's `/api/chat` and yields tokens from its newline-delimited JSON, plus the final token counts (`prompt_eval_count`, `eval_count`).
- [ ] Plain `fetch`, no SDK, matching `embed()`.

### 4. Streaming route: `app/api/ask/route.ts`

- [ ] `POST { question }` returns server-sent events, in this order:
  1. `sources`: the k chunks (`n`, chunk id, title, path, content, distance), sent first so the UI can show them before the answer arrives.
  2. `token`: each piece of the answer as it is generated.
  3. `done`: token counts, latency, the citation check result and the trace id.
  4. `error`: if retrieval or the model fails partway through.
- [ ] No new dependencies (`ReadableStream` plus the SSE text format).

### 5. Citation check

- [ ] After the answer finishes, parse its `[n]` markers.
- [ ] The answer is valid if it has at least one marker and every marker is in `1…k`, or if it is exactly the refusal sentence.
- [ ] Otherwise mark it **uncited** in `done`; the UI shows a warning. An uncited answer is a bug, so it must be visible, never hidden.

### 6. Trace

- [ ] Insert one `traces` row per question: question, retrieved chunk ids, full prompt, answer, input/output tokens, latency.

### 7. UI: `app/page.tsx`

- [ ] A question box and the streamed answer, using plain React state and no UI library.
- [ ] `EventSource` only supports GET, so read the SSE stream from `fetch()` and parse it by hand.
- [ ] Render each `[n]` as a clickable marker that shows its source chunk (title, path, text).
- [ ] Show the uncited warning when the check fails.

### 8. Config and docs

- [ ] Make `qwen2.5:7b` the default `CHAT_MODEL` in `.env.example` and `CLAUDE.md` (it is already installed locally).
- [ ] Add `topK` to `lib/config.ts`.
- [ ] Update the `CLAUDE.md` commands and layout.

## Verification

| Question | Expected |
|---|---|
| How long do file locks last? | 72 hours, cites `Sync Conflicts > File locking`; ideally also the 15-minute crashed-agent note from release notes 4.2 |
| Can I expense a coworking space? | Up to 250 EUR/month, cites `Remote Work > Coworking` |
| What happens if I get paged at 3am? | Known retrieval weak spot: `On-call > Pay` was outside the top 3 in testing. Check whether top 5 catches it |
| What is the CEO's salary? | Exactly `The documents don't cover this.`, no citations |

Done when all four behave as expected in the browser, citations open the right chunk, and each question leaves a row in `traces`. Stop for review before committing.
