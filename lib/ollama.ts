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
