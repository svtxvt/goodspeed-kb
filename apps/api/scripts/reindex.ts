// Re-embeds every document into the ACTIVE embedding space (AI_EMBEDDING_* in
// apps/api/.env). Run it after changing the embedding model or dimensions:
//
//   pnpm reindex
//
// Until a document is re-embedded, search simply does not see it (chunks are
// filtered by embedding space); vectors from two models are never compared.
// Each document is replaced atomically and only if it was not edited meanwhile
// (one retry with the latest version), so the script is safe to re-run and to
// run while users are working.
//
// This is an operator task across all users, so it uses the service-role key
// (bypasses RLS). The key comes from SUPABASE_SERVICE_ROLE_KEY in the shell,
// or, for the local stack, from `supabase status`. It is never stored in the
// API's .env, and the API itself never uses it.

import { createEmbeddingModel, type EmbeddingModel } from '@kb/ai';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { DocumentRow } from '../src/common/supabase.js';
import { loadConfig, loadEnvFile } from '../src/config.js';
import { embedDocument } from '../src/rag/embed-document.js';
import { localServiceRoleKey } from './local-supabase.js';

const PAGE_SIZE = 100;
const COLUMNS = 'id, title, content, version';
type Doc = Pick<DocumentRow, 'id' | 'title' | 'content' | 'version'>;

async function reindexDocument(
  admin: SupabaseClient,
  model: EmbeddingModel,
  doc: Doc,
): Promise<'reindexed' | 'skipped'> {
  let current = doc;
  for (let attempt = 1; ; attempt++) {
    const chunks = await embedDocument(current, model);
    const { data: replaced, error } = await admin.rpc('replace_document_chunks', {
      p_document_id: current.id,
      p_version: current.version,
      p_chunks: chunks,
    });
    if (error) throw new Error(error.message);
    if (replaced) return 'reindexed';
    if (attempt === 2) return 'skipped';

    // Edited since we read it: read the latest version and try once more.
    const latest = await admin.from('documents').select(COLUMNS).eq('id', doc.id).maybeSingle();
    if (latest.error) throw new Error(latest.error.message);
    if (!latest.data) return 'skipped'; // deleted meanwhile
    current = latest.data as Doc;
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || localServiceRoleKey();
  if (!serviceKey) {
    throw new Error(
      'No service-role key: start the local stack (pnpm db:start) or set SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  const admin = createClient(config.supabase.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const model = createEmbeddingModel(config.ai);
  console.log(`Re-embedding all documents into space "${model.space.id}"`);

  const totals = { reindexed: 0, skipped: 0, failed: 0 };
  // Keyset pagination: stable even when documents are added or deleted meanwhile.
  let lastId: string | null = null;
  for (;;) {
    let page = admin.from('documents').select(COLUMNS).order('id').limit(PAGE_SIZE);
    if (lastId) page = page.gt('id', lastId);
    const { data, error } = await page;
    if (error) throw new Error(`Could not list documents: ${error.message}`);
    const documents = data as Doc[];

    for (const doc of documents) {
      try {
        totals[await reindexDocument(admin, model, doc)]++;
      } catch (error) {
        totals.failed++;
        console.error(`  ${doc.id} "${doc.title}": ${(error as Error).message}`);
      }
    }
    if (documents.length < PAGE_SIZE) break;
    lastId = documents.at(-1)!.id;
  }

  console.log(
    `Done: ${totals.reindexed} re-embedded, ${totals.skipped} skipped (changed twice or deleted meanwhile), ${totals.failed} failed.`,
  );
  if (totals.failed > 0) {
    console.log('Re-run `pnpm reindex` to retry the failed documents.');
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
