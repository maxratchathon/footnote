// Ask a question from the terminal, without the UI:
//
//   pnpm ask "How long do file locks last?"
//
// Prints the retrieved sources, streams the answer, then the citation check.

import { ask } from "../lib/ask";
import { pool } from "../lib/db";

async function main() {
  const question = process.argv.slice(2).join(" ").trim();
  if (!question) throw new Error('Usage: pnpm ask "your question"');

  for await (const ev of ask(question)) {
    switch (ev.type) {
      case "sources":
        for (const s of ev.sources) {
          console.log(`[${s.n}] ${s.distance.toFixed(3)}  ${s.content.split("\n")[0]}  (${s.sourcePath})`);
        }
        console.log();
        break;
      case "token":
        process.stdout.write(ev.text);
        break;
      case "done":
        console.log(
          `\n\ncitations: ${ev.citations.status} ${JSON.stringify(ev.citations.cited)}` +
            (ev.citations.invalid.length ? ` invalid ${JSON.stringify(ev.citations.invalid)}` : "") +
            `  |  ${ev.inputTokens} in / ${ev.outputTokens} out tokens, ${ev.latencyMs} ms, trace ${ev.traceId}`,
        );
        break;
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
