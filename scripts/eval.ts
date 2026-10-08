// Retrieval eval: for each test question, is the chunk that answers it among
// the top k retrieved? Prints the scores, the misses and what changed since
// the previous run of the same question file, and records the run in
// eval_runs.
//
//   pnpm eval [file] [--note "targetChars 600"] [--no-save]
//
// Default file: corpus/evals.json (git-ignored, like the corpus). Format and
// matching rules: lib/eval.ts. Re-ingest after changing chunk settings, or
// this scores the old chunks.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "../lib/config";
import { pool } from "../lib/db";
import {
  checkLabels,
  DEPTH,
  describe,
  firstHitRank,
  KS,
  score,
  sectionName,
  type EvalQuestion,
  type Expected,
  type Scores,
} from "../lib/eval";
import { retrieve } from "../lib/retrieve";

interface QuestionResult {
  id: string;
  question: string;
  expected: Expected[];
  tags: string[];
  rank: number | null; // null = miss, or unanswerable
  top: { chunkId: string; chunkIndex: number; section: string; distance: number }[];
}

async function main() {
  const args = process.argv.slice(2);
  const noSave = args.includes("--no-save");
  const noteAt = args.indexOf("--note");
  const note = noteAt >= 0 ? args[noteAt + 1] : null;
  const file = args.find((a, i) => !a.startsWith("--") && i !== noteAt + 1) ?? "corpus/evals.json";

  const raw = await readFile(file, "utf8");
  const hash = createHash("sha256").update(raw).digest("hex");
  const questions = JSON.parse(raw) as EvalQuestion[];

  const { rows: allChunks } = await pool.query<{ content: string }>("SELECT content FROM chunks");
  const { errors, warnings } = checkLabels(questions, allChunks);
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length) {
    throw new Error(`Fix the question file first:\n  ${errors.join("\n  ")}`);
  }

  // One retrieval per question at the deepest k; every hit@k comes from it.
  const results: QuestionResult[] = [];
  for (const q of questions) {
    const chunks = await retrieve(q.question, DEPTH);
    results.push({
      id: q.id,
      question: q.question,
      expected: q.expected,
      tags: q.tags ?? [],
      rank: q.expected.length ? firstHitRank(chunks, q.expected) : null,
      top: chunks.map((c) => ({
        chunkId: c.id,
        chunkIndex: c.chunkIndex,
        section: sectionName(c.content),
        distance: c.distance,
      })),
    });
  }

  // Unanswerable questions have no right chunk, so they are left out of the
  // score (they matter for the answer checks, not retrieval).
  const scored = results.filter((r) => r.expected.length > 0);
  const scores = score(scored.map((r) => r.rank));

  const settings = {
    embedModel: config.embedModel,
    targetChars: config.chunking.targetChars,
    maxChars: config.chunking.maxChars,
    topK: config.retrieval.topK,
    depth: DEPTH,
    chunkCount: allChunks.length,
    git: gitVersion(),
  };

  const { rows: prev } = await pool.query(
    `SELECT id, created_at, note, question_set_hash, n_questions, hit_at_1, hit_at_3, hit_at_5, hit_at_10, mrr, results
     FROM eval_runs WHERE question_set = $1 ORDER BY id DESC LIMIT 1`,
    [file],
  );

  report(file, settings, scores, results, prev[0]);

  if (noSave) {
    console.log("\n(--no-save: run not recorded)");
  } else {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO eval_runs (question_set, question_set_hash, note, settings, n_questions,
                              hit_at_1, hit_at_3, hit_at_5, hit_at_10, mrr, results)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        file,
        hash,
        note,
        settings,
        scores.n,
        ...KS.map((k) => scores.hits[k] / scores.n),
        scores.mrr,
        JSON.stringify(results),
      ],
    );
    console.log(`\nsaved as eval run ${rows[0].id}`);
  }

  function report(
    file: string,
    s: typeof settings,
    scores: Scores,
    results: QuestionResult[],
    prev: Record<string, any> | undefined,
  ) {
    const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
    console.log(
      `${file}: ${scores.n} scored questions (+${results.length - scores.n} unanswerable)\n` +
        `${s.embedModel}, targetChars ${s.targetChars}, maxChars ${s.maxChars}, ${s.chunkCount} chunks, git ${s.git}` +
        (note ? `\nnote: ${note}` : "") +
        "\n",
    );

    const samePrev = prev && prev.question_set_hash === hash;
    for (const k of KS) {
      const hit = scores.hits[k] / scores.n;
      const delta = samePrev ? `  ${signed((hit - prev[`hit_at_${k}`]) * 100)} pts` : "";
      const headline = k === config.retrieval.topK ? "  <- topK, what reaches the prompt" : "";
      console.log(`hit@${String(k).padEnd(2)}  ${pct(hit)}  (${scores.hits[k]}/${scores.n})${delta}${headline}`);
    }
    console.log(`MRR     ${scores.mrr.toFixed(3)}` + (samePrev ? `   ${signed(scores.mrr - prev.mrr, 3)}` : ""));

    // Per tag, at topK: shows *which kind* of question retrieval struggles
    // with (e.g. English questions over Thai text, or paraphrases).
    const k = config.retrieval.topK;
    const tags = [...new Set(results.flatMap((r) => r.tags))].filter((t) => t !== "unanswerable").sort();
    console.log(`\nhit@${k} by tag:`);
    for (const tag of tags) {
      const ranks = results.filter((r) => r.expected.length && r.tags.includes(tag)).map((r) => r.rank);
      const n = ranks.filter((r) => r !== null && r <= k).length;
      console.log(`  ${tag.padEnd(12)} ${pct(n / ranks.length)}  (${n}/${ranks.length})`);
    }

    // How close is the nearest chunk? If unanswerable questions sit clearly
    // further away, a distance cutoff could help refusals; if not, it can't.
    const meanTop1 = (rs: QuestionResult[]) => rs.reduce((sum, r) => sum + r.top[0].distance, 0) / rs.length;
    const unanswerable = results.filter((r) => r.expected.length === 0);
    if (unanswerable.length) {
      console.log(
        `\nmean distance of the nearest chunk: answerable ${meanTop1(results.filter((r) => r.expected.length)).toFixed(3)}, ` +
          `unanswerable ${meanTop1(unanswerable).toFixed(3)}`,
      );
    }

    const misses = results.filter((r) => r.expected.length && (r.rank === null || r.rank > k));
    if (misses.length) {
      console.log(`\nmissed at ${k} (${misses.length}):`);
      for (const r of misses) {
        console.log(
          `  ${r.id}  "${r.question}"\n` +
            `    expected ${r.expected.map(describe).join(" | ")}; first hit ${r.rank ? `at rank ${r.rank}` : `not in top ${DEPTH}`}\n` +
            `    got: ${r.top.slice(0, 3).map((t) => `${t.section} (${t.distance.toFixed(3)})`).join(", ")}`,
        );
      }
    }

    if (!prev) {
      console.log("\nno previous run of this question file to compare with");
      return;
    }
    // Per-question moves are the honest unit of change: with ~45 questions,
    // "+2.3 pts" is one question, and it matters which one. Every rank change
    // is listed, not just flips across k, because a metric near 100% can't
    // show improvements while ranks underneath it still move.
    const before = new Map<string, QuestionResult>(prev.results.map((r: QuestionResult) => [r.id, r]));
    const moves: string[] = [];
    let changed = 0;
    for (const r of results.filter((r) => r.expected.length)) {
      const old = before.get(r.id);
      if (!old || old.question !== r.question || JSON.stringify(old.expected) !== JSON.stringify(r.expected)) {
        changed++;
        continue;
      }
      if (old.rank === r.rank) continue;
      const better = (r.rank ?? Infinity) < (old.rank ?? Infinity);
      const crossed = (old.rank !== null && old.rank <= k) !== (r.rank !== null && r.rank <= k);
      moves.push(
        `  ${better ? "+" : "-"} ${r.id}  rank ${old.rank ?? "miss"} -> ${r.rank ?? "miss"}` +
          (crossed ? `  (${better ? "now" : "no longer"} within ${k})` : ""),
      );
    }
    const when = new Date(prev.created_at).toISOString().slice(0, 16).replace("T", " ");
    console.log(`\nvs run ${prev.id} (${when}${prev.note ? `, ${prev.note}` : ""}):`);
    if (!samePrev) console.log("  question file changed since then, so headline deltas are not shown");
    if (changed) console.log(`  ${changed} question(s) new or edited, not compared`);
    console.log(moves.length ? moves.join("\n") : "  no rank changed");
  }
}

function signed(x: number, digits = 1): string {
  return (x >= 0 ? "+" : "") + x.toFixed(digits);
}

// Short commit hash, marked dirty when tracked files have uncommitted changes
// (e.g. an edited lib/config.ts). The corpus is git-ignored, so its state is
// captured by chunkCount and the run's per-question results instead.
function gitVersion(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
