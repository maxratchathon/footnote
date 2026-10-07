// POST { question } → text/event-stream of AskEvents (see lib/ask-events.ts).
//
// Server-sent events are plain text over a long-lived HTTP response:
//   event: token
//   data: {"type":"token","text":"Locks"}
//   <blank line>
// One-way server → browser is all streaming an answer needs, so there is no
// need for WebSockets.

import { ask } from "@/lib/ask";
import type { AskEvent } from "@/lib/ask-events";

// Runs on the Node.js runtime (Next's default), which pg needs. POST handlers
// are never cached, so no route segment config is required.

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "question is required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: AskEvent) =>
        controller.enqueue(encoder.encode(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`));
      try {
        // req.signal fires when the browser disconnects; passing it down
        // cancels the Ollama request so the model stops generating.
        for await (const ev of ask(question, req.signal)) send(ev);
      } catch (err) {
        if (!req.signal.aborted) {
          console.error(err);
          send({ type: "error", message: (err as Error).message });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed because the client went away
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
