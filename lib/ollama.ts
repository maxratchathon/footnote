import { config } from "./config";

// nomic-embed-text is trained with task prefixes: documents and queries are
// embedded differently, and leaving the prefixes off measurably hurts
// retrieval. Other embedding models may need different (or no) prefixes.
export type EmbedTask = "search_document" | "search_query";

export async function embed(texts: string[], task: EmbedTask): Promise<number[][]> {
  const res = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.embedModel,
      input: texts.map((t) => `${task}: ${t}`),
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed failed (${res.status}): ${await res.text()}`);
  }
  const { embeddings } = (await res.json()) as { embeddings: number[][] };

  // Catch a model/config mismatch here, with a clear message, rather than
  // as a cryptic pgvector dimension error on insert.
  for (const e of embeddings) {
    if (e.length !== config.embedDim) {
      throw new Error(
        `${config.embedModel} returned ${e.length} dims but EMBED_DIM=${config.embedDim}`,
      );
    }
  }
  return embeddings;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "done"; inputTokens: number; outputTokens: number };

// Streams a chat completion. Ollama answers with newline-delimited JSON: one
// object per generated piece of text, then a final object with done: true
// and the token counts.
export async function* chatStream(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      model: config.chatModel,
      messages,
      stream: true,
      options: { num_ctx: config.chat.contextTokens, temperature: config.chat.temperature },
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Ollama chat failed (${res.status}): ${await res.text()}`);
  }

  const reader = res.body.getReader();
  // stream: true keeps a multi-byte character split across reads intact.
  const decoder = new TextDecoder();
  let buffered = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    // A network read can end mid-line; keep the incomplete tail for next time.
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.error) throw new Error(`Ollama chat error: ${msg.error}`);
      if (msg.message?.content) yield { type: "token", text: msg.message.content };
      if (msg.done) {
        yield { type: "done", inputTokens: msg.prompt_eval_count ?? 0, outputTokens: msg.eval_count ?? 0 };
      }
    }
  }
}
