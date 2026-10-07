// Applies db/migrations/*.sql in filename order, each once, each in its own
// transaction. Applied migrations are recorded in schema_migrations.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../lib/config";
import { pool } from "../lib/db";

const DIR = path.join(import.meta.dirname, "../db/migrations");

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = (await readFile(path.join(DIR, file), "utf8")).replaceAll(
      "{{EMBED_DIM}}",
      String(config.embedDim),
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.log("migrations up to date");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
