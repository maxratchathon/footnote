import { config } from "./config";
import { pool, toVector } from "./db";
import { embed } from "./ollama";

export interface RetrievedChunk {
  id: string; // bigint; pg returns it as a string to avoid precision loss
  documentId: string;
  title: string;
  sourcePath: string;
  chunkIndex: number;
  content: string;
  distance: number; // cosine distance: 0 = same direction, larger = less related
}

// Vector search: embed the question and return the k nearest chunks.
// ORDER BY <=> ... LIMIT k is the shape the HNSW index can serve; anything
// else (e.g. filtering on distance first) falls back to a full scan.
export async function retrieve(question: string, k: number = config.retrieval.topK): Promise<RetrievedChunk[]> {
  // "query", not "document": some models embed questions and documents
  // differently (see lib/ollama.ts).
  const [vector] = await embed([question], "query");

  const { rows } = await pool.query(
    `SELECT c.id, c.document_id, d.title, d.source_path, c.chunk_index, c.content,
            c.embedding <=> $1::vector AS distance
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [toVector(vector), k],
  );

  return rows.map((r) => ({
    id: r.id,
    documentId: r.document_id,
    title: r.title,
    sourcePath: r.source_path,
    chunkIndex: r.chunk_index,
    content: r.content,
    distance: Number(r.distance),
  }));
}
