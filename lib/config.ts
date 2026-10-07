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
} as const;
