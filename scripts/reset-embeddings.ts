// Prepares the database for a different embedding model:
//
//   1. set EMBED_MODEL and EMBED_DIM in .env
//   2. pnpm db:reset-embeddings
//   3. pnpm ingest <folder>   (for every folder you want searchable)
//
// Vectors from different models live in different spaces and cannot be
// compared, so every stored chunk must be re-embedded. Documents are deleted
// too (chunks cascade): otherwise ingest would see unchanged content hashes
// and skip the files. traces are kept; their chunk ids just point at chunks
// that no longer exist.

import { config } from "../lib/config";
import { pool } from "../lib/db";

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query("DELETE FROM documents");
    // The HNSW index is built for one dimension, so drop it before resizing
    // the column and rebuild it after. Looked up by definition rather than
    // name, so this works whatever the index happens to be called.
    const { rows } = await client.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'chunks' AND indexdef ILIKE '%hnsw%'",
    );
    for (const r of rows) await client.query(`DROP INDEX ${client.escapeIdentifier(r.indexname)}`);
    await client.query(`ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(${config.embedDim})`);
    await client.query("CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)");
    await client.query("COMMIT");
    console.log(
      `Removed ${rowCount} document(s); chunks.embedding is now vector(${config.embedDim}) for ${config.embedModel}.\n` +
        "Re-ingest every folder you want searchable, e.g. pnpm ingest corpus",
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
