-- {{EMBED_DIM}} is substituted from the EMBED_DIM env var by scripts/migrate.ts.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  -- Unique so re-running ingestion updates a file instead of duplicating it.
  source_path text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id bigserial PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector({{EMBED_DIM}}) NOT NULL,
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);

-- one row per question asked, for debugging and cost tracking
CREATE TABLE traces (
  id bigserial PRIMARY KEY,
  question text NOT NULL,
  retrieved_chunk_ids bigint[] NOT NULL,
  prompt text NOT NULL,
  answer text,
  input_tokens int,
  output_tokens int,
  latency_ms int,
  created_at timestamptz NOT NULL DEFAULT now()
);
