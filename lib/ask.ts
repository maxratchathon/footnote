// The question flow, end to end: retrieve → prompt → stream answer → check
// citations → trace. Transport-agnostic: the API route turns these events
// into server-sent events, and scripts/ask.ts prints them in the terminal.

import type { AskEvent } from "./ask-events";
import { checkCitations } from "./citations";
import { pool } from "./db";
import { chatStream } from "./ollama";
import { buildPrompt, promptText } from "./prompt";
import { retrieve } from "./retrieve";

export async function* ask(question: string, signal?: AbortSignal): AsyncGenerator<AskEvent> {
  const started = performance.now();

  const chunks = await retrieve(question);
  const prompt = buildPrompt(question, chunks);
  yield {
    type: "sources",
    sources: prompt.sources.map((c, i) => ({
      n: i + 1,
      chunkId: c.id,
      title: c.title,
      sourcePath: c.sourcePath,
      content: c.content,
      distance: c.distance,
    })),
  };

  let answer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  const messages = [
    { role: "system" as const, content: prompt.system },
    { role: "user" as const, content: prompt.user },
  ];
  for await (const ev of chatStream(messages, signal)) {
    if (ev.type === "token") {
      answer += ev.text;
      yield ev;
    } else {
      inputTokens = ev.inputTokens;
      outputTokens = ev.outputTokens;
    }
  }

  const citations = checkCitations(answer, chunks.length);
  const latencyMs = Math.round(performance.now() - started);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO traces (question, retrieved_chunk_ids, prompt, answer, input_tokens, output_tokens, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [question, chunks.map((c) => c.id), promptText(prompt), answer, inputTokens, outputTokens, latencyMs],
  );

  yield { type: "done", traceId: rows[0].id, citations, inputTokens, outputTokens, latencyMs };
}
