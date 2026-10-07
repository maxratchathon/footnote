// The event stream for one question, shared by the server (lib/ask.ts,
// app/api/ask) and the UI. Order: sources, token*, done, or error at any
// point. Type-only: safe to import from client components.

import type { CitationCheck } from "./citations";

export interface Source {
  n: number; // the [n] marker this source is cited as
  chunkId: string;
  title: string;
  sourcePath: string;
  content: string;
  distance: number;
}

export type AskEvent =
  | { type: "sources"; sources: Source[] }
  | { type: "token"; text: string }
  | {
      type: "done";
      traceId: string;
      citations: CitationCheck;
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
    }
  | { type: "error"; message: string };
