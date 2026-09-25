// Re-embeds every document into the ACTIVE embedding space (AI_EMBEDDING_* in
// apps/api/.env). Run it after changing the embedding model or dimensions:
//
//   pnpm reindex
//
// Until a document is re-embedded, search simply does not see it (chunks are
// filtered by embedding space); vectors from two models are never compared.
// Each document is replaced atomically and only if it was not edited meanwhile,
// so the script is safe to re-run and to run while users are working.
//
// This is an operator task across all users, so it uses the service-role key
// (bypasses RLS). The API itself never holds that key.

import { createEmbeddingModel } from '@kb/ai';
import { createClient } from '@supabase/supabase-js';

import type { DocumentRow } from '../src/common/supabase.js';
import { loadConfig, loadEnvFile } from '../src/config.js';
import { embedDocument } from '../src/rag/embed-document.js';

const PAGE_SIZE = 100;

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for reindexing.');

  const admin = createClient(config.supabase.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const model = createEmbeddingModel(config.ai);
  console.log(`Re-embedding all documents into space "${model.space.id}"`);

  const totals = { reindexed: 0, skipped: 0, failed: 0 };
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('documents')
      .select('id, title, content, version')
      .order('created_at')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not list documents: ${error.message}`);
    const documents = data as Pick<DocumentRow, 'id' | 'title' | 'content' | 'version'>[];

    for (const doc of documents) {
      try {
        const chunks = await embedDocument(doc, model);
        const { data: replaced, error: rpcError } = await admin.rpc('replace_document_chunks', {
          p_document_id: doc.id,
          p_version: doc.version,
          p_chunks: chunks,
        });
        if (rpcError) throw new Error(rpcError.message);
        // false = edited since we read it; that edit already embedded the new content.
        totals[replaced ? 'reindexed' : 'skipped']++;
      } catch (error) {
        totals.failed++;
        console.error(`  ${doc.id} "${doc.title}": ${(error as Error).message}`);
      }
    }
    if (documents.length < PAGE_SIZE) break;
  }

  console.log(
    `Done: ${totals.reindexed} re-embedded, ${totals.skipped} skipped (edited meanwhile), ${totals.failed} failed.`,
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
