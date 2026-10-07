// Parsing and checking [n] markers. Shared by the server (to validate an
// answer) and the UI (to render markers as links), so both agree on what
// counts as a citation. Must not import server-only code (pg, config).

import { REFUSAL } from "./prompt";

// Matches [2] and also the [1, 3] form small models sometimes produce.
export const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

export type CitationStatus = "cited" | "refusal" | "uncited" | "invalid";

export interface CitationCheck {
  status: CitationStatus;
  cited: number[]; // distinct valid markers, in order of first use
  invalid: number[]; // markers outside 1..k (the model made up a source)
}

export function markerNumbers(match: string): number[] {
  return match.slice(1, -1).split(",").map((n) => Number(n.trim()));
}

export function checkCitations(answer: string, k: number): CitationCheck {
  const cited: number[] = [];
  const invalid: number[] = [];
  for (const m of answer.matchAll(MARKER)) {
    for (const n of markerNumbers(m[0])) {
      const list = n >= 1 && n <= k ? cited : invalid;
      if (!list.includes(n)) list.push(n);
    }
  }

  let status: CitationStatus;
  if (invalid.length) status = "invalid";
  else if (cited.length) status = "cited";
  else if (isRefusal(answer)) status = "refusal";
  else status = "uncited";
  return { status, cited, invalid };
}

// Tolerate trivial variations (quotes, whitespace, missing period) but not
// extra content: a refusal plus an answer is an answer and needs citations.
function isRefusal(answer: string): boolean {
  const norm = (s: string) => s.trim().replace(/^["']|["']$/g, "").replace(/\.$/, "").toLowerCase();
  return norm(answer) === norm(REFUSAL);
}
