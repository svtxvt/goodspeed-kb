import type { EmbeddingModel } from '@kb/ai';

import type { ChunkRow } from '../common/supabase.js';
import { chunkMarkdown } from './chunker.js';

/**
 * Chunks a document and embeds every chunk. The title is part of the embedded
 * text (not of the stored chunk) so a chunk like "It takes 3 days" is still
 * found by a question that names the document's subject.
 */
export async function embedDocument(
  document: { title: string; content: string },
  model: EmbeddingModel,
): Promise<ChunkRow[]> {
  const chunks = chunkMarkdown(document.content);
  if (chunks.length === 0) return [];

  const vectors = await model.embed(chunks.map((chunk) => `${document.title}\n\n${chunk}`));
  return chunks.map((content, i) => ({
    chunk_index: i,
    content,
    embedding_space: model.space.id,
    embedding: JSON.stringify(vectors[i]),
  }));
}
