// Markdown-aware chunker.
//
// Strategy, in order of preference for where to cut:
//   1. Headings. A section is the natural unit of meaning in docs, so a chunk
//      never spans two sections.
//   2. Blank lines between blocks (paragraphs, lists, code fences). Inside a
//      section, blocks are packed greedily up to `targetChars`.
//   3. Line breaks, only when a single block exceeds `maxChars` (usually a
//      long code sample).
//
// Each chunk is prefixed with its heading breadcrumb ("Title > Section >
// Subsection"). A paragraph like "Pass it as a prop instead." means little on
// its own; the breadcrumb tells both the embedding and the model which topic
// it belongs to. The stored content is exactly the embedded text, so what the
// UI shows for a citation is what retrieval actually matched.
//
// No overlap between chunks: cutting on section and paragraph boundaries
// already avoids splitting mid-thought. Overlap is a knob to revisit with
// Stage 2 evals.

export interface ChunkOptions {
  targetChars: number;
  maxChars: number;
}

export interface ParsedDoc {
  title: string;
  chunks: string[];
}

interface Section {
  headings: string[]; // breadcrumb below the title, e.g. ["Usage", "Passing props"]
  blocks: string[];
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export function parseMarkdown(raw: string, fallbackTitle: string, opts: ChunkOptions): ParsedDoc {
  const { title: fmTitle, body } = stripFrontmatter(raw);
  const sections = splitSections(body);

  // Prefer frontmatter title, then the first H1, then the filename.
  const title = fmTitle ?? body.match(/^#\s+(.+)$/m)?.[1].trim() ?? fallbackTitle;

  const chunks: string[] = [];
  for (const section of sections) {
    const crumbs = [title, ...section.headings.filter((h) => h !== title)];
    const prefix = crumbs.join(" > ");
    for (const text of packBlocks(section.blocks, opts)) {
      chunks.push(`${prefix}\n\n${text}`);
    }
  }
  return { title, chunks };
}

function stripFrontmatter(raw: string): { title?: string; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { body: raw };
  const title = m[1].match(/^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  return { title, body: raw.slice(m[0].length) };
}

// Walk lines once, tracking code fences so a "# comment" inside a shell
// snippet is not mistaken for a heading, and a blank line inside a code
// sample does not split it.
function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  const stack: string[] = []; // stack[level-1] = heading text
  let current: Section = { headings: [], blocks: [] };
  let block: string[] = [];
  let inFence = false;

  const flushBlock = () => {
    const text = block.join("\n").trim();
    if (text) current.blocks.push(text);
    block = [];
  };
  const flushSection = () => {
    flushBlock();
    if (current.blocks.length) sections.push(current);
  };

  for (const line of body.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      if (!inFence) flushBlock(); // a fence starts its own block
      block.push(line);
      inFence = !inFence;
      if (!inFence) flushBlock();
      continue;
    }
    if (inFence) {
      block.push(line);
      continue;
    }
    const h = line.match(HEADING);
    if (h) {
      flushSection();
      const level = h[1].length;
      stack.length = level - 1;
      stack[level - 1] = h[2];
      current = { headings: stack.filter(Boolean), blocks: [] };
      continue;
    }
    if (line.trim() === "") {
      flushBlock();
      continue;
    }
    block.push(line);
  }
  flushSection();
  return sections;
}

function packBlocks(blocks: string[], { targetChars, maxChars }: ChunkOptions): string[] {
  const out: string[] = [];
  let buf = "";

  for (const block of blocks.flatMap((b) => (b.length > maxChars ? splitLines(b, maxChars) : [b]))) {
    if (buf && buf.length + 2 + block.length > targetChars) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n\n${block}` : block;
  }
  if (buf) out.push(buf);
  return out;
}

// Last resort for an oversized block: cut on line breaks, and mid-line only
// if a single line is itself longer than maxChars.
function splitLines(block: string, maxChars: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (let line of block.split("\n")) {
    while (line.length > maxChars) {
      if (buf) out.push(buf), (buf = "");
      out.push(line.slice(0, maxChars));
      line = line.slice(maxChars);
    }
    if (buf && buf.length + 1 + line.length > maxChars) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n${line}` : line;
  }
  if (buf) out.push(buf);
  return out;
}
