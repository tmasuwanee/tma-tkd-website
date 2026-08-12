/**
 * Playbook RAG (read-only assistant) — 2026-08-11
 *
 * Retrieval over the front-desk SOP + playbook (the UNSTRUCTURED "how do I..."
 * knowledge). Structured data (students/leads/payments) uses live tools instead;
 * this is only for policy / procedure questions.
 *
 * Corpus text is baked into server/playbook-corpus.ts (regenerate with
 * scripts/build-playbook-corpus.mjs). Embeddings are computed once per server
 * boot via OpenAI and cached in memory; each query embeds its text and cosine-
 * ranks the chunks. Small corpus (~dozens of chunks) so no vector DB is needed.
 */
import { embed, embedMany, cosineSimilarity } from "ai";
import { openai } from "@ai-sdk/openai";
import { ENV } from "./_core/env";
import { PLAYBOOK_CORPUS, type PlaybookChunk } from "./playbook-corpus";

const EMBED_MODEL = "text-embedding-3-small";

// Cache the corpus embeddings for the server's lifetime (computed lazily on the
// first playbook question). Stored as a Promise so concurrent calls share one job.
let corpusEmbeddings: Promise<number[][]> | null = null;
function embedCorpus(): Promise<number[][]> {
  if (!corpusEmbeddings) {
    corpusEmbeddings = embedMany({
      model: openai.embedding(EMBED_MODEL),
      values: PLAYBOOK_CORPUS.map(c => c.text),
    }).then(r => r.embeddings).catch(err => {
      corpusEmbeddings = null; // let a later call retry instead of caching the failure
      throw err;
    });
  }
  return corpusEmbeddings;
}

export type PlaybookHit = PlaybookChunk & { score: number };

/** Return the top-k most relevant playbook/SOP chunks for a question. */
export async function retrievePlaybook(question: string, k = 4): Promise<PlaybookHit[]> {
  if (!ENV.openaiApiKey || PLAYBOOK_CORPUS.length === 0) return [];
  const embeddings = await embedCorpus();
  const { embedding: q } = await embed({ model: openai.embedding(EMBED_MODEL), value: question });
  return PLAYBOOK_CORPUS
    .map((c, i) => ({ ...c, score: cosineSimilarity(q, embeddings[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
