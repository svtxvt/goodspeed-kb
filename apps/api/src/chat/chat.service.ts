import { Inject, Injectable } from '@nestjs/common';
import type { ChatModel, EmbeddingModel } from '@kb/ai';
import type { ChatResponseDto, chatRequestSchema } from '@kb/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

import { dbError, type MatchRow } from '../common/supabase.js';
import type { AppConfig } from '../config.js';
import {
  buildMessages,
  extractCitations,
  NOT_FOUND_ANSWER,
  PROMPT_BUDGET,
  selectSources,
} from '../rag/prompt.js';
import { APP_CONFIG, CHAT_MODEL, EMBEDDING_MODEL } from '../tokens.js';

type ChatRequest = z.output<typeof chatRequestSchema>;

@Injectable()
export class ChatService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CHAT_MODEL) private readonly chat: ChatModel,
    @Inject(EMBEDDING_MODEL) private readonly embeddings: EmbeddingModel,
  ) {}

  async ask(db: SupabaseClient, { question, history }: ChatRequest): Promise<ChatResponseDto> {
    // Follow-ups ("what about its limits?") rarely name their subject, so the
    // previous question joins the retrieval query. The model still sees the
    // latest question on its own.
    const previousQuestion = history.findLast((turn) => turn.role === 'user')?.content;
    const retrievalQuery = previousQuestion ? `${previousQuestion}\n${question}` : question;

    const [queryEmbedding] = await this.embeddings.embed([retrievalQuery]);
    const { data, error } = await db.rpc('match_document_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: this.config.rag.matchCount,
      min_similarity: this.config.rag.minSimilarity,
      embedding_space: this.embeddings.space.id,
    });
    if (error) throw dbError(error);

    const sources = selectSources(
      (data as MatchRow[]).map((row) => ({
        documentId: row.document_id,
        documentTitle: row.document_title,
        content: row.content,
      })),
      PROMPT_BUDGET.contextTokens,
    );

    // Nothing relevant: say so instead of letting the model improvise.
    if (sources.length === 0) {
      return { answer: NOT_FOUND_ANSWER, citations: [], grounded: false };
    }

    const answer = await this.chat.complete(buildMessages(question, history, sources));
    return { answer, citations: extractCitations(answer, sources), grounded: true };
  }
}
