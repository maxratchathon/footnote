// Ingestion: read every .md/.txt file under a folder, chunk it, embed the
// chunks with Ollama, and store documents + chunks in Postgres.
//
//   pnpm ingest [folder] [--dry-run]
//
// Re-running is cheap and safe. Each file is keyed by its path; unchanged
// files (same content hash) are skipped, changed files are replaced, and
// documents whose file has been deleted are removed. With --dry-run nothing
// is embedded or written: it only shows how the files would be chunked.

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseMarkdown } from "../lib/chunk";
import { config } from "../lib/config";
import { pool, toVector } from "../lib/db";
import { embed } from "../lib/ollama";

const EXTENSIONS = new Set([".md", ".txt"]);
// Chunks per Ollama request. Batching saves round trips; the exact size
// barely matters at this scale.
const EMBED_BATCH = 32;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const root = args.find((a) => !a.startsWith("--")) ?? "corpus";

  const files = await listFiles(root);
  if (files.length === 0) throw new Error(`No .md or .txt files found under ${root}`);

  const sizes: number[] = [];
  let skipped = 0;

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const hash = createHash("sha256").update(raw).digest("hex");
    const fallbackTitle = path.basename(file, path.extname(file));
    const { title, chunks } = parseMarkdown(raw, fallbackTitle, config.chunking);
    sizes.push(...chunks.map((c) => c.length));

    if (dryRun) {
      console.log(`${file}  "${title}"  ${chunks.length} chunks`);
      continue;
    }

    const existing = await pool.query<{ content_hash: string }>(
      "SELECT content_hash FROM documents WHERE source_path = $1",
      [file],
    );
    if (existing.rows[0]?.content_hash === hash) {
      skipped++;
      continue;
    }

    // Embed before opening the transaction, so a slow model never holds
    // database locks.
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      embeddings.push(...(await embed(chunks.slice(i, i + EMBED_BATCH), "search_document")));
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Replacing the whole document (chunks cascade) is simpler than diffing
      // chunks, and keeps chunk_index contiguous.
      await client.query("DELETE FROM documents WHERE source_path = $1", [file]);
      const { rows } = await client.query<{ id: string }>(
        "INSERT INTO documents (title, source_path, content_hash) VALUES ($1, $2, $3) RETURNING id",
        [title, file, hash],
      );
      for (const [i, content] of chunks.entries()) {
        await client.query(
          "INSERT INTO chunks (document_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4::vector)",
          [rows[0].id, i, content, toVector(embeddings[i])],
        );
      }
      await client.query("COMMIT");
      console.log(`ingested ${file}  (${chunks.length} chunks)`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  if (!dryRun) {
    // Drop documents under this folder whose files no longer exist, so
    // deleted docs stop showing up in retrieval.
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    const removed = await pool.query(
      "DELETE FROM documents WHERE starts_with(source_path, $1) AND NOT (source_path = ANY($2)) RETURNING source_path",
      [prefix, files],
    );
    for (const r of removed.rows) console.log(`removed ${r.source_path}`);
    console.log(`${skipped} unchanged file(s) skipped`);
  }

  sizes.sort((a, b) => a - b);
  console.log(
    `\n${files.length} files, ${sizes.length} chunks; chunk chars min ${sizes[0]}, ` +
      `median ${sizes[Math.floor(sizes.length / 2)]}, max ${sizes.at(-1)}`,
  );
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && EXTENSIONS.has(path.extname(e.name)))
    .map((e) => path.join(e.parentPath, e.name))
    .sort();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
