import pg from "pg";
import { config } from "./config";

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// pgvector accepts the text form '[0.1,0.2,...]', so a JSON array literal
// cast with ::vector is enough. No pgvector client library needed.
export function toVector(embedding: number[]): string {
  return JSON.stringify(embedding);
}
