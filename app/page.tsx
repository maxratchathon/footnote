"use client";

import { useRef, useState } from "react";
import type { AskEvent, Source } from "@/lib/ask-events";
import { type CitationCheck, MARKER, markerNumbers } from "@/lib/citations";

type Status = "idle" | "retrieving" | "answering" | "done" | "error";

export default function Home() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [sources, setSources] = useState<Source[]>([]);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Extract<AskEvent, { type: "done" }> | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || status === "retrieving" || status === "answering") return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    setStatus("retrieving");
    setSources([]);
    setAnswer("");
    setResult(null);
    setError("");
    setSelected(null);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
      // EventSource only supports GET, so the SSE stream is parsed by hand.
      for await (const ev of readEvents(res.body)) {
        if (ev.type === "sources") {
          setSources(ev.sources);
          setStatus("answering");
        } else if (ev.type === "token") {
          setAnswer((a) => a + ev.text);
        } else if (ev.type === "done") {
          setResult(ev);
          setStatus("done");
        } else {
          throw new Error(ev.message);
        }
      }
    } catch (err) {
      if (abort.signal.aborted) return;
      setError((err as Error).message);
      setStatus("error");
    }
  }

  const busy = status === "retrieving" || status === "answering";
  const selectedSource = sources.find((s) => s.n === selected);

  return (
    <main>
      <h1>FootnoteRAG</h1>
      <p className="muted">Answers come only from your documents, and every claim cites its source.</p>

      <form onSubmit={submit} className="ask">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about your docs"
          aria-label="Question"
          autoFocus
        />
        <button disabled={busy || !question.trim()}>{busy ? "Answering…" : "Ask"}</button>
      </form>

      {status === "retrieving" && <p className="muted">Searching documents…</p>}
      {error && <p className="error">Error: {error}</p>}

      {(answer || status === "answering") && (
        <section className="answer">
          <p>
            <Answer text={answer} sourceCount={sources.length} selected={selected} onSelect={setSelected} />
            {status === "answering" && <span className="cursor">▍</span>}
          </p>
          {result && <CitationBadge check={result.citations} />}
        </section>
      )}

      {selectedSource && (
        <section className="source-detail">
          <header>
            <strong>
              [{selectedSource.n}] {selectedSource.title}
            </strong>
            <button className="link" onClick={() => setSelected(null)}>
              close
            </button>
          </header>
          <div className="muted small">
            {selectedSource.sourcePath} · chunk {selectedSource.chunkId} · distance {selectedSource.distance.toFixed(3)}
          </div>
          <pre>{selectedSource.content}</pre>
        </section>
      )}

      {sources.length > 0 && (
        <section>
          <h2>Retrieved sources</h2>
          <ol className="sources">
            {sources.map((s) => (
              <li key={s.n} className={result?.citations.cited.includes(s.n) ? "used" : ""}>
                <button className="link" onClick={() => setSelected(s.n)}>
                  [{s.n}] {s.content.split("\n")[0]}
                </button>
                <span className="muted small"> {s.distance.toFixed(3)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {result && (
        <p className="muted small">
          {result.inputTokens} input / {result.outputTokens} output tokens · {(result.latencyMs / 1000).toFixed(1)} s ·
          trace {result.traceId}
        </p>
      )}
    </main>
  );
}

// Splits the answer into text and [n] markers. Uses the same MARKER regex as
// the server's citation check, so what the UI links is what was validated.
function Answer(props: { text: string; sourceCount: number; selected: number | null; onSelect: (n: number) => void }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of props.text.matchAll(MARKER)) {
    parts.push(props.text.slice(last, m.index));
    for (const n of markerNumbers(m[0])) {
      const valid = n >= 1 && n <= props.sourceCount;
      parts.push(
        <button
          key={`${m.index}-${n}`}
          className={`marker${valid ? "" : " invalid"}${props.selected === n ? " active" : ""}`}
          onClick={() => valid && props.onSelect(n)}
          title={valid ? `Show source ${n}` : `Source ${n} does not exist`}
        >
          {n}
        </button>,
      );
    }
    last = m.index + m[0].length;
  }
  parts.push(props.text.slice(last));
  return <>{parts}</>;
}

function CitationBadge({ check }: { check: CitationCheck }) {
  switch (check.status) {
    case "cited":
      return null;
    case "refusal":
      return <p className="muted small">No source covered this question.</p>;
    case "uncited":
      return <p className="error">⚠ This answer has no citations, so it cannot be checked against your documents.</p>;
    case "invalid":
      return <p className="error">⚠ This answer cites sources that do not exist: {check.invalid.join(", ")}.</p>;
  }
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AskEvent> {
  const reader = body.getReader();
  // stream: true keeps a multi-byte character split across reads intact.
  const decoder = new TextDecoder();
  let buffered = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buffered += decoder.decode(value, { stream: true });
    // Events are separated by a blank line; the last piece may be incomplete.
    const events = buffered.split("\n\n");
    buffered = events.pop() ?? "";
    for (const raw of events) {
      const data = raw
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (data) yield JSON.parse(data) as AskEvent;
    }
  }
}
