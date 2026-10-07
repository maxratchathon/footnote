// All tunables in one place. Values that change retrieval quality (chunk
// sizes, models) live here so Stage 2 evals can compare them.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (see .env.example)`);
  return value;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  embedModel: required("EMBED_MODEL"),
  embedDim: Number(required("EMBED_DIM")),
  chatModel: required("CHAT_MODEL"),

  chunking: {
    // Measured in characters, not tokens: no tokenizer dependency, and for
    // English prose ~4 chars ≈ 1 token. 1200 chars ≈ 300 tokens.
    targetChars: 1200,
    // Hard ceiling. Ollama runs nomic-embed-text with a 2048-token context
    // by default, so this stays well under it even for dense code.
    maxChars: 2000,
  },

  retrieval: {
    // Chunks put in the prompt. Enough to catch a useful second source
    // without burying a 7B model in text. Tuned by Stage 2 evals.
    topK: 5,
  },

  chat: {
    // Ollama silently drops the start of a prompt longer than its context
    // window (default 4096 tokens here), which would cut off the system rules.
    // 5 chunks × 2000 chars ≈ 2500 tokens, plus rules and answer, fits in 8192.
    contextTokens: 8192,
    // 0 = always pick the most likely token. Grounded answers should not be
    // creative, and identical runs make debugging and evals reproducible.
    temperature: 0,
  },
} as const;
