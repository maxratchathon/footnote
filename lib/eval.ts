// Retrieval scoring for Stage 2 evals. Pure functions, no database or model
// calls: scripts/eval.ts does the I/O and uses these to decide what counts as
// a hit.
//
// A question names the *section* that answers it ("12.2"), not a chunk id.
// Chunk ids and positions change whenever chunk sizes change, and comparing
// chunk sizes is the point of evals, so labels must survive re-chunking.
// Every chunk starts with its heading breadcrumb ("Title > 12. ภาษี… >
// 12.2 ภาษีเงินได้…"), which is what a label is matched against, plus an
// `evidence` substring from the answer itself, so that only the chunk that
// holds the answer counts, however the section happens to be split.

export type Expected = string | { section: string; evidence?: string };

export interface EvalQuestion {
  id: string;
  question: string;
  // Any one of these counts as a hit. Empty = the corpus doesn't answer it.
  expected: Expected[];
  tags?: string[];
}

export interface RankedChunk {
  id: string;
  chunkIndex: number;
  content: string;
  distance: number;
}

export const DEPTH = 10; // how many chunks are retrieved per question
export const KS = [1, 3, 5, 10] as const;

// The breadcrumb line split into its parts, title included.
export function breadcrumb(content: string): string[] {
  return content.split("\n", 1)[0].split(" > ");
}

// The most specific heading, for reports: "12.2 ภาษีเงินได้จากค่าเช่า".
export function sectionName(content: string): string {
  return breadcrumb(content).at(-1)!;
}

// "12.2" matches the segment "12.2 ภาษี…"; "21" matches "21. คำถามพบบ่อย…";
// "Pay" matches the segment "Pay". Requiring the space or ". " after the
// label keeps "1" from matching "1.1 …" and "1.2" from matching "1.23 …".
function labelMatches(segment: string, label: string): boolean {
  return segment === label || segment.startsWith(label + " ") || segment.startsWith(label + ". ");
}

export function matches(content: string, exp: Expected): boolean {
  const { section, evidence } = typeof exp === "string" ? { section: exp, evidence: undefined } : exp;
  return (
    breadcrumb(content).some((seg) => labelMatches(seg, section)) &&
    (evidence === undefined || content.includes(evidence))
  );
}

export function describe(exp: Expected): string {
  return typeof exp === "string" ? exp : exp.evidence ? `${exp.section} "${exp.evidence}"` : exp.section;
}

// 1-based rank of the first chunk that matches any expected label, or null.
export function firstHitRank(chunks: RankedChunk[], expected: Expected[]): number | null {
  const i = chunks.findIndex((c) => expected.some((e) => matches(c.content, e)));
  return i === -1 ? null : i + 1;
}

// Problems with the labels themselves, checked against every stored chunk
// before any scoring. A label typo would otherwise look like a retrieval miss.
export function checkLabels(
  questions: EvalQuestion[],
  allChunks: { content: string }[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const q of questions) {
    if (ids.has(q.id)) errors.push(`${q.id}: duplicate id`);
    ids.add(q.id);
    for (const e of q.expected) {
      const n = allChunks.filter((c) => matches(c.content, e)).length;
      if (n === 0) errors.push(`${q.id}: "${describe(e)}" matches no chunk`);
      // Without evidence, any chunk of the section counts. Smaller chunks
      // split sections into more pieces, so the score would get more lenient
      // as chunks shrink: exactly the bias that ruins a chunk-size comparison.
      else if (typeof e === "string" || !e.evidence) {
        warnings.push(`${q.id}: "${describe(e)}" has no evidence, so any chunk of it counts (${n} now)`);
      }
    }
  }
  return { errors, warnings };
}

export interface Scores {
  n: number;
  hits: Record<(typeof KS)[number], number>; // count of questions hit within k
  mrr: number;
}

// hit@k: share of questions whose first hit is within the top k.
// MRR: mean of 1/rank (0 for a miss). hit@5 can't tell rank 1 from rank 5;
// MRR can, so it shows a change that moves answers up without crossing k.
export function score(ranks: (number | null)[]): Scores {
  const hits = Object.fromEntries(KS.map((k) => [k, ranks.filter((r) => r !== null && r <= k).length])) as Scores["hits"];
  const mrr = ranks.length ? ranks.reduce<number>((sum, r) => sum + (r ? 1 / r : 0), 0) / ranks.length : 0;
  return { n: ranks.length, hits, mrr };
}
