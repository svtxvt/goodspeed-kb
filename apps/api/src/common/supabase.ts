import {
  BadRequestException,
  ConflictException,
  type HttpException,
  NotFoundException,
} from '@nestjs/common';
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';

/**
 * A Supabase client that acts AS the caller: PostgREST re-verifies the JWT and
 * Postgres applies RLS with auth.uid() = the caller. Creating one is cheap (no
 * network), so the API makes one per request and never holds a privileged key.
 */
export function createUserClient(
  supabase: { url: string; publishableKey: string },
  accessToken: string,
): SupabaseClient {
  return createClient(supabase.url, supabase.publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Rows as Postgres returns them (hand-written; see README "Improvements"). */
export interface DocumentRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ChunkRow {
  chunk_index: number;
  content: string;
  embedding_space: string;
  /** pgvector text form, e.g. "[0.1,0.2]". */
  embedding: string;
}

export interface MatchRow {
  chunk_id: number;
  document_id: string;
  document_title: string;
  content: string;
  similarity: number;
}

export class DatabaseError extends Error {
  override readonly name = 'DatabaseError';
}

/** Translates Postgres/PostgREST errors into HTTP errors the client can act on. */
export function dbError(error: PostgrestError): HttpException | DatabaseError {
  switch (error.code) {
    case 'KB409': // raised by save_document
      return new ConflictException({
        error: 'version_conflict',
        message:
          'This document was changed since you opened it. Reload to get the latest version.',
      });
    case 'KB404': // raised by save_document
    case 'PGRST116': // .single() found no row (missing, or another user's: RLS hides it)
      return new NotFoundException({ error: 'not_found', message: 'Document not found' });
    case '23514': // check_violation: the schema's own limits
      return new BadRequestException({ error: 'validation_failed', message: error.message });
    default:
      return new DatabaseError(`${error.code}: ${error.message}`);
  }
}
