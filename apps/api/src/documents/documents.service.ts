import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { EmbeddingModel } from '@kb/ai';
import type {
  DocumentDto,
  DocumentSummaryDto,
  documentInputSchema,
  documentUpdateSchema,
} from '@kb/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';

import { dbError, type ChunkRow, type DocumentRow } from '../common/supabase.js';
import { embedDocument } from '../rag/embed-document.js';
import { EMBEDDING_MODEL } from '../tokens.js';

type DocumentInput = z.output<typeof documentInputSchema>;
type DocumentUpdate = z.output<typeof documentUpdateSchema>;

const toDto = (row: DocumentRow): DocumentDto => ({
  id: row.id,
  title: row.title,
  content: row.content,
  tags: row.tags,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Every method takes the caller's user-scoped client: there is no code path
 * that reads or writes documents without RLS.
 */
@Injectable()
export class DocumentsService {
  constructor(@Inject(EMBEDDING_MODEL) private readonly embeddings: EmbeddingModel) {}

  async list(db: SupabaseClient): Promise<DocumentSummaryDto[]> {
    const { data, error } = await db
      .from('documents')
      .select('id, title, tags, updated_at')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) throw dbError(error);
    return (data as Pick<DocumentRow, 'id' | 'title' | 'tags' | 'updated_at'>[]).map((row) => ({
      id: row.id,
      title: row.title,
      tags: row.tags,
      updatedAt: row.updated_at,
    }));
  }

  async get(db: SupabaseClient, id: string): Promise<DocumentDto> {
    const { data, error } = await db.from('documents').select('*').eq('id', id).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundException({ error: 'not_found', message: 'Document not found' });
    return toDto(data as DocumentRow);
  }

  /** Embeds first, then writes document + chunks in one transaction. */
  async create(db: SupabaseClient, input: DocumentInput): Promise<DocumentDto> {
    const chunks = await embedDocument(input, this.embeddings);
    return this.save(db, null, null, input, chunks);
  }

  async update(db: SupabaseClient, id: string, input: DocumentUpdate): Promise<DocumentDto> {
    const current = await this.get(db, id);
    // Cheap early exit; save_document re-checks the version atomically.
    if (current.version !== input.version) {
      throw new ConflictException({
        error: 'version_conflict',
        message: 'This document was changed since you opened it. Reload to get the latest version.',
      });
    }
    // Title is part of the embedded text, so either change means re-embedding.
    // Otherwise the existing chunks are kept (p_chunks = null), unless there
    // are none in the active space (dropped by a direct update, or embedded by
    // another model): then this save re-indexes the document.
    const changed = current.title !== input.title || current.content !== input.content;
    const reembed = changed || !(await this.hasChunksInActiveSpace(db, id));
    const chunks = reembed ? await embedDocument(input, this.embeddings) : null;
    return this.save(db, id, input.version, input, chunks);
  }

  private async hasChunksInActiveSpace(db: SupabaseClient, id: string): Promise<boolean> {
    const { count, error } = await db
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', id)
      .eq('embedding_space', this.embeddings.space.id);
    if (error) throw dbError(error);
    return (count ?? 0) > 0;
  }

  async remove(db: SupabaseClient, id: string): Promise<void> {
    // Chunks go with it (ON DELETE CASCADE).
    const { data, error } = await db.from('documents').delete().eq('id', id).select('id');
    if (error) throw dbError(error);
    if (data.length === 0) {
      throw new NotFoundException({ error: 'not_found', message: 'Document not found' });
    }
  }

  private async save(
    db: SupabaseClient,
    id: string | null,
    expectedVersion: number | null,
    input: DocumentInput,
    chunks: ChunkRow[] | null,
  ): Promise<DocumentDto> {
    const { data, error } = await db
      .rpc('save_document', {
        p_id: id,
        p_expected_version: expectedVersion,
        p_title: input.title,
        p_content: input.content,
        p_tags: input.tags,
        p_chunks: chunks,
      })
      .single();
    if (error) throw dbError(error);
    return toDto(data as DocumentRow);
  }
}
