-- One row per `pnpm eval` run: the settings it ran with, the scores, and the
-- per-question results, so any two runs can be compared later without
-- re-running the old settings.

CREATE TABLE eval_runs (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The question file, e.g. corpus/evals.json. Runs are compared only
  -- against earlier runs of the same file.
  question_set text NOT NULL,
  -- sha256 of the file. A different hash means the questions changed, so the
  -- headline scores are not directly comparable.
  question_set_hash text NOT NULL,
  note text,
  -- embed model, chunk sizes, retrieval depth, chunk count, git commit
  settings jsonb NOT NULL,
  n_questions int NOT NULL, -- answerable questions that were scored
  -- Shares between 0 and 1.
  hit_at_1 real NOT NULL,
  hit_at_3 real NOT NULL,
  hit_at_5 real NOT NULL,
  hit_at_10 real NOT NULL,
  mrr real NOT NULL,
  -- Per question: id, question, expected, rank of the first hit (null = miss)
  -- and the top retrieved chunks.
  results jsonb NOT NULL
);
