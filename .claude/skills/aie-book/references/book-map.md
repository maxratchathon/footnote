# Book map: AI Engineering (Chip Huyen) × FootnoteRAG

Table of contents verified on 2026-10-07 against the official companion repo: https://github.com/chiphuyen/aie-book (`ToC.md`, `chapter-summaries.md`). Chapter and section titles only; no book text.

"Project link" says where each part shows up in FootnoteRAG (see `docs/plans/overview.md` for stage status).

---

## 1. Introduction to Building AI Applications with Foundation Models
- The Rise of AI Engineering: From Language Models to LLMs; From LLMs to Foundation Models; From Foundation Models to AI Engineering
- Foundation Model Use Cases: Coding; Image and Video Production; Writing; Education; Conversational Bots; **Information Aggregation**; Data Organization; Workflow Automation
- Planning AI Applications: Use Case Evaluation; Setting Expectations; **Milestone Planning**; Maintenance
- The AI Engineering Stack: Three Layers of the AI Stack; AI Engineering Versus ML Engineering; AI Engineering Versus Full-Stack Engineering

**Project link:** the whole project is an "information aggregation" app built at the application layer of the stack. The staged roadmap is milestone planning.

## 2. Understanding Foundation Models
- Training Data: **Multilingual Models**; Domain-Specific Models
- Modeling: Model Architecture; Model Size
- Post-Training: Supervised Finetuning; Preference Finetuning
- Sampling: Sampling Fundamentals; **Sampling Strategies**; Test Time Compute; **Structured Outputs**; The Probabilistic Nature of AI

**Project link:**
- *Multilingual Models* ↔ the Thai bug: `nomic-embed-text`'s English-only tokenizer embedded all Thai text identically; fixed by switching to `bge-m3`.
- *Model Size* ↔ choosing `qwen2.5:7b` for a 16 GB M4.
- *Sampling Strategies* ↔ `temperature: 0` in `lib/config.ts`.
- *Probabilistic Nature of AI* ↔ why citations are checked after generation (`lib/citations.ts`) instead of trusted.
- *Test Time Compute* ↔ Qwen3's "thinking" mode, which we'd turn off with `think: false`.

## 3. Evaluation Methodology
- Challenges of Evaluating Foundation Models
- Understanding Language Modeling Metrics: Entropy; Cross Entropy; Bits-per-Character and Bits-per-Byte; Perplexity; Perplexity Interpretation and Use Cases
- Exact Evaluation: **Functional Correctness**; **Similarity Measurements Against Reference Data**; **Introduction to Embedding**
- **AI as a Judge**: Why; How to Use; Limitations; What Models Can Act as Judges
- Ranking Models with Comparative Evaluation: Challenges; The Future of Comparative Evaluation

**Project link:** Stage 2.
- Retrieval hit rate is *exact evaluation* against reference data: the expected chunk is the reference.
- *Introduction to Embedding* explains `bge-m3` and cosine distance.
- *AI as a Judge* is the natural next step after hit rate: grading answer faithfulness to the cited chunks. It's not in the brief yet, so it's an optional extension.

## 4. Evaluate AI Systems
- Evaluation Criteria: Domain-Specific Capability; **Generation Capability** (factual consistency, faithfulness, etc.); **Instruction-Following Capability**; **Cost and Latency**
- Model Selection: Model Selection Workflow; Model Build Versus Buy; Navigate Public Benchmarks
- **Design Your Evaluation Pipeline**: Step 1. Evaluate All Components in a System; Step 2. Create an Evaluation Guideline; Step 3. Define Evaluation Methods and Data

**Project link:** Stage 2 design.
- *Evaluate all components* = measure retrieval separately from generation (hit rate first).
- *Instruction-following* = does the model cite and refuse as told (`checkCitations` statuses).
- *Cost and latency* = `traces` columns, Stage 5.
- *Model selection* ↔ local Ollama models instead of hosted APIs.

## 5. Prompt Engineering
- Introduction to Prompting: In-Context Learning (Zero-Shot and Few-Shot); **System Prompt and User Prompt**; **Context Length and Context Efficiency**
- Best Practices: **Write Clear and Explicit Instructions**; **Provide Sufficient Context**; Break Complex Tasks into Simpler Subtasks; Give the Model Time to Think; Iterate on Your Prompts; Evaluate Prompt Engineering Tools; **Organize and Version Prompts**
- **Defensive Prompt Engineering**: Proprietary Prompts and Reverse Prompt Engineering; **Jailbreaking and Prompt Injection**; Information Extraction; **Defenses Against Prompt Attacks**

**Project link:** `lib/prompt.ts`.
- Rules in the system message, sources and question in the user message.
- The exact refusal sentence is a clear, explicit instruction.
- `num_ctx: 8192` relates to context length: Ollama silently truncates beyond it.
- `<source>` tags are a first defense against prompt injection; Stage 5 guardrails continue it.
- *Organize and version prompts* ↔ the full prompt stored in `traces.prompt`.

## 6. RAG and Agents (the core chapter for this project)
- RAG: **RAG Architecture**; **Retrieval Algorithms**; **Retrieval Optimization**; RAG Beyond Texts
- Agents: **Agent Overview**; **Tools**; **Planning**; **Agent Failure Modes and Evaluation**
- Memory

**Project link:**
- *RAG Architecture* = Stage 1 (`lib/ask.ts`: retrieve → prompt → generate).
- *Retrieval Algorithms* = term-based (BM25 / full-text) vs embedding-based retrieval, i.e. Stage 1's vector search vs Stage 3's keyword side. Thai needs special handling (no spaces; Postgres has no Thai parser).
- *Retrieval Optimization* = chunking strategy (`lib/chunk.ts`), reranking, query rewriting, contextual retrieval (our heading breadcrumbs are a simple form), hybrid search: Stage 3.
- *Agents / Tools / Planning / Failure Modes* = Stage 4's hand-written loop with `search_corpus` and `fetch_document`, an iteration cap and tool errors.
- *Memory* relates to context limits and conversation history; not in the brief yet.

## 7. Finetuning
- Finetuning Overview
- When to Finetune: Reasons to Finetune; Reasons Not to Finetune; **Finetuning and RAG**
- Memory Bottlenecks: Backpropagation and Trainable Parameters; Memory Math; Numerical Representations; **Quantization**
- Finetuning Techniques: Parameter-Efficient Finetuning (LoRA etc.); Model Merging and Multi-Task Finetuning; Finetuning Tactics

**Project link:** out of scope.
- *Finetuning and RAG* explains why this project uses RAG: it adds knowledge at question time without changing the model.
- *Quantization* explains why a 7B model fits on 16 GB (Ollama's default Q4 builds).

## 8. Dataset Engineering
- Data Curation: Data Quality; **Data Coverage**; Data Quantity; **Data Acquisition and Annotation**
- Data Augmentation and Synthesis: Why Data Synthesis; Traditional Techniques; **AI-Powered Data Synthesis**; Model Distillation
- Data Processing: **Inspect Data**; **Deduplicate Data**; **Clean and Filter Data**; Format Data

**Project link:** the Stage 2 eval set.
- Coverage: easy, hard, unanswerable, Thai and English questions.
- Annotation: the user checks the expected sections.
- AI-powered synthesis: Claude drafts questions, the user verifies them.
- *Inspect / clean data* ↔ `pnpm ingest --dry-run` and chunk inspection.

## 9. Inference Optimization
- Understanding Inference Optimization: Inference Overview; **Inference Performance Metrics** (time to first token, time per output token, throughput); AI Accelerators
- Inference Optimization: **Model Optimization** (quantization, distillation, KV cache, attention kernels); **Inference Service Optimization** (batching, parallelism, **prompt caching**)

**Project link:** Stage 5.
- Latency breakdown per request.
- The first question is slow because Ollama loads the model: a cold start.
- Batching ↔ `EMBED_BATCH` in `scripts/ingest.ts`.
- Running on the M4 GPU via Metal = AI accelerators.

## 10. AI Engineering Architecture and User Feedback
- AI Engineering Architecture: **Step 1. Enhance Context**; **Step 2. Put in Guardrails**; Step 3. Add Model Router and Gateway; **Step 4. Reduce Latency with Caches**; **Step 5. Add Agent Patterns**; **Monitoring and Observability**; AI Pipeline Orchestration
- User Feedback: Extracting Conversational Feedback; Feedback Design; Feedback Limitations

**Project link:** the chapter's 5 steps line up with the project's stages.
- Enhance context = RAG (Stages 1 and 3).
- Guardrails = Stage 5 prompt-injection defenses.
- Caches = Stage 5 embedding cache.
- Agent patterns = Stage 4.
- Monitoring and observability = `traces` plus the Stage 5 trace viewer.
- User feedback (e.g. thumbs up/down on answers) is a possible extension, not in the brief.

---

## Quick lookup: project stage → chapters

| Stage | Read |
|---|---|
| 1 Basic RAG (done) | Ch. 6 RAG Architecture, Retrieval Algorithms; Ch. 5 System/User Prompt; Ch. 2 Multilingual Models, Sampling |
| 2 Evals | Ch. 3 Exact Evaluation, AI as a Judge; Ch. 4 Design Your Evaluation Pipeline; Ch. 8 Data Coverage, AI-Powered Data Synthesis |
| 3 Better retrieval | Ch. 6 Retrieval Algorithms, Retrieval Optimization |
| 4 Agent loop | Ch. 6 Agents (Overview, Tools, Planning, Failure Modes) |
| 5 Production | Ch. 10 Architecture steps 2 and 4, Monitoring and Observability; Ch. 9 Inference Performance Metrics; Ch. 5 Defensive Prompt Engineering |
