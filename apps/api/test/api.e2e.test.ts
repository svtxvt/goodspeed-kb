// End-to-end tests: the real Nest app against the local Supabase stack (real
// Postgres, RLS and Auth), with mock AI models. Skipped when Supabase is not
// running (`pnpm db:start`).

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AIProviderError, type Message, MockChatModel, MockEmbeddingModel } from '@kb/ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { localServiceRoleKey } from '../scripts/local-supabase.js';
import { AppModule } from '../src/app.module.js';
import { createUserClient } from '../src/common/supabase.js';
import { loadConfig, loadEnvFile } from '../src/config.js';
import { APP_CONFIG, CHAT_MODEL, EMBEDDING_MODEL } from '../src/tokens.js';

loadEnvFile();
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? '';

async function supabaseIsUp(): Promise<boolean> {
  if (!supabaseUrl || !publishableKey) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
      headers: { apikey: publishableKey },
    });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await supabaseIsUp();
if (!available) console.warn('Supabase is not running: skipping API e2e tests (pnpm db:start).');

/** Embedding model whose next call can be made to fail like a provider outage. */
class FlakyEmbeddingModel extends MockEmbeddingModel {
  failNext = false;

  override async embed(texts: string[]): Promise<number[][]> {
    if (this.failNext) {
      this.failNext = false;
      throw new AIProviderError('unavailable', 'simulated provider outage');
    }
    return super.embed(texts);
  }
}

/** Chat model that records the prompts it receives. */
class RecordingChatModel extends MockChatModel {
  readonly prompts: Message[][] = [];

  override async complete(messages: Message[]): Promise<string> {
    this.prompts.push(messages);
    return super.complete(messages);
  }
}

interface TestUser {
  id: string;
  token: string;
  db: SupabaseClient;
}

async function signUp(label: string): Promise<TestUser> {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'password-123' }),
  });
  const body = (await res.json()) as { access_token?: string; user?: { id: string } };
  if (!body.access_token || !body.user) throw new Error(`signup failed: ${JSON.stringify(body)}`);
  return {
    id: body.user.id,
    token: body.access_token,
    db: createUserClient({ url: supabaseUrl, publishableKey }, body.access_token),
  };
}

describe.skipIf(!available)('API against local Supabase', () => {
  let app: INestApplication;
  let embeddings: FlakyEmbeddingModel;
  let chat: RecordingChatModel;
  let alice: TestUser;
  let bob: TestUser;

  const api = () => request(app.getHttpServer());
  const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

  async function createDocument(user: TestUser, title: string, content: string) {
    const res = await api().post('/documents').set(as(user)).send({ title, content, tags: [] });
    expect(res.status).toBe(201);
    return res.body as { id: string; version: number };
  }

  beforeAll(async () => {
    embeddings = new FlakyEmbeddingModel();
    chat = new RecordingChatModel();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(loadConfig({ ...process.env, AI_MOCK: 'true' }))
      .overrideProvider(EMBEDDING_MODEL)
      .useValue(embeddings)
      .overrideProvider(CHAT_MODEL)
      .useValue(chat)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    [alice, bob] = await Promise.all([signUp('alice'), signUp('bob')]);
  });

  afterAll(async () => {
    await app?.close();
    // Deleting the users cascades to their documents and chunks.
    const serviceKey = localServiceRoleKey();
    if (serviceKey) {
      for (const user of [alice, bob].filter(Boolean)) {
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
          method: 'DELETE',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
      }
    }
  });

  it('rejects requests without a valid token', async () => {
    expect((await api().get('/documents')).status).toBe(401);
    const res = await api().get('/documents').set('Authorization', 'Bearer not-a-jwt');
    expect(res.body).toMatchObject({ statusCode: 401, error: 'unauthorized' });
  });

  describe('tenant isolation (RLS)', () => {
    let secret: { id: string; version: number };

    beforeAll(async () => {
      secret = await createDocument(
        alice,
        'Alice private plans',
        'The launch codename is Bluebird and ships in March.',
      );
    });

    it("hides Alice's document from Bob's list and direct reads", async () => {
      const list = await api().get('/documents').set(as(bob));
      expect(list.status).toBe(200);
      expect(list.body).toEqual([]);
      const read = await api().get(`/documents/${secret.id}`).set(as(bob));
      expect(read.body).toMatchObject({ statusCode: 404, error: 'not_found' });
    });

    it('does not let Bob update or delete it', async () => {
      const update = await api()
        .put(`/documents/${secret.id}`)
        .set(as(bob))
        .send({ title: 'pwned', content: 'pwned', tags: [], version: secret.version });
      expect(update.status).toBe(404);
      const del = await api().delete(`/documents/${secret.id}`).set(as(bob));
      expect(del.status).toBe(404);

      const stillThere = await api().get(`/documents/${secret.id}`).set(as(alice));
      expect(stillThere.body).toMatchObject({ title: 'Alice private plans', version: 1 });
    });

    it("never retrieves Alice's chunks for Bob, via the API or directly", async () => {
      const chat = await api()
        .post('/chat')
        .set(as(bob))
        .send({ question: 'What is the launch codename and when does it ship?' });
      expect(chat.status).toBe(200);
      expect(chat.body).toMatchObject({ grounded: false, citations: [] });

      // Straight to PostgREST with Bob's token: RLS, not the API, is the wall.
      const chunks = await bob.db.from('document_chunks').select('id');
      expect(chunks.error).toBeNull();
      expect(chunks.data).toEqual([]);
      const [vector] = await embeddings.embed(['launch codename Bluebird March']);
      const match = await bob.db.rpc('match_document_chunks', {
        query_embedding: JSON.stringify(vector),
        match_count: 10,
        min_similarity: -1,
        embedding_space: embeddings.space.id,
      });
      expect(match.error).toBeNull();
      expect(match.data).toEqual([]);
    });

    it('does not call the model when nothing relevant is retrieved', async () => {
      const calls = chat.prompts.length;
      const res = await api()
        .post('/chat')
        .set(as(alice))
        .send({ question: 'What is the capital of Peru?' });
      expect(res.body).toMatchObject({ grounded: false, citations: [] });
      expect(chat.prompts.length).toBe(calls);
    });

    it('sends history and delimited sources, and uses the previous question for retrieval', async () => {
      const res = await api()
        .post('/chat')
        .set(as(alice))
        .send({
          question: 'And when does it ship?',
          history: [
            { role: 'user', content: 'What is the launch codename?' },
            { role: 'assistant', content: 'It is Bluebird [1].' },
          ],
        });
      expect(res.body.grounded).toBe(true);
      const prompt = chat.prompts.at(-1)!;
      expect(prompt.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
      expect(prompt[2]!.content).toBe('It is Bluebird.');
      expect(prompt[3]!.content).toMatch(
        /^<sources>\n\[1\] Alice private plans\n[\s\S]*<\/sources>\n\nQuestion: And when does it ship\?$/,
      );
    });

    it('answers Alice from her own document with a validated citation', async () => {
      const chat = await api()
        .post('/chat')
        .set(as(alice))
        .send({ question: 'What is the launch codename and when does it ship?' });
      expect(chat.status).toBe(200);
      expect(chat.body.grounded).toBe(true);
      expect(chat.body.citations[0]).toMatchObject({
        n: 1,
        documentId: secret.id,
        documentTitle: 'Alice private plans',
      });
    });
  });

  describe('atomic, versioned writes', () => {
    it('keeps the old document and chunks when embedding fails during an update', async () => {
      const doc = await createDocument(alice, 'Office guide', 'The wifi password is sunflower.');
      const before = await alice.db
        .from('document_chunks')
        .select('content')
        .eq('document_id', doc.id);

      embeddings.failNext = true;
      const res = await api().put(`/documents/${doc.id}`).set(as(alice)).send({
        title: 'Office guide',
        content: 'The wifi password is tulip.',
        tags: [],
        version: 1,
      });
      expect(res.status).toBe(503);
      expect(res.body.error).toBe('ai_unavailable');

      const after = await api().get(`/documents/${doc.id}`).set(as(alice));
      expect(after.body).toMatchObject({ content: 'The wifi password is sunflower.', version: 1 });
      const chunks = await alice.db
        .from('document_chunks')
        .select('content')
        .eq('document_id', doc.id);
      expect(chunks.data).toEqual(before.data);
      expect(chunks.data).toHaveLength(1);
    });

    it('writes nothing when embedding fails during a create', async () => {
      const count = (await api().get('/documents').set(as(alice))).body.length as number;
      embeddings.failNext = true;
      const res = await api()
        .post('/documents')
        .set(as(alice))
        .send({ title: 'Never saved', content: 'Some text.', tags: [] });
      expect(res.status).toBe(503);
      expect((await api().get('/documents').set(as(alice))).body).toHaveLength(count);
    });

    it('rejects an update based on a stale version with 409', async () => {
      const doc = await createDocument(alice, 'Roadmap', 'Q1: search. Q2: sharing.');
      const first = await api()
        .put(`/documents/${doc.id}`)
        .set(as(alice))
        .send({ title: 'Roadmap', content: 'Q1: search. Q2: exports.', tags: [], version: 1 });
      expect(first.status).toBe(200);
      expect(first.body.version).toBe(2);

      const stale = await api()
        .put(`/documents/${doc.id}`)
        .set(as(alice))
        .send({ title: 'Roadmap', content: 'Overwrite from an old tab.', tags: [], version: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe('version_conflict');

      const current = await api().get(`/documents/${doc.id}`).set(as(alice));
      expect(current.body).toMatchObject({ content: 'Q1: search. Q2: exports.', version: 2 });
    });

    it('bumps the version and drops stale chunks when a row is updated around the API', async () => {
      const doc = await createDocument(alice, 'Direct', 'Original text about apples.');
      const direct = await alice.db
        .from('documents')
        .update({ content: 'Edited straight through PostgREST.' })
        .eq('id', doc.id);
      expect(direct.error).toBeNull();

      const after = await api().get(`/documents/${doc.id}`).set(as(alice));
      expect(after.body).toMatchObject({
        content: 'Edited straight through PostgREST.',
        version: 2,
      });
      const chunks = await alice.db.from('document_chunks').select('id').eq('document_id', doc.id);
      expect(chunks.data).toEqual([]);

      const stale = await api()
        .put(`/documents/${doc.id}`)
        .set(as(alice))
        .send({ title: 'Direct', content: 'From an old tab.', tags: [], version: 1 });
      expect(stale.status).toBe(409);
    });

    it('refuses changed text without new chunks in save_document', async () => {
      const doc = await createDocument(alice, 'Guarded', 'Some text.');
      const { error } = await alice.db.rpc('save_document', {
        p_id: doc.id,
        p_expected_version: 1,
        p_title: 'Guarded',
        p_content: 'Different text.',
        p_tags: [],
        p_chunks: null,
      });
      expect(error?.code).toBe('KB422');
    });

    it('replaces chunks when content changes and removes them on delete', async () => {
      const doc = await createDocument(alice, 'Recipe', 'Mix flour and water.');
      await api()
        .put(`/documents/${doc.id}`)
        .set(as(alice))
        .send({
          title: 'Recipe',
          content: 'Mix flour, water and salt.',
          tags: ['food'],
          version: 1,
        })
        .expect(200);
      const chunks = await alice.db
        .from('document_chunks')
        .select('content')
        .eq('document_id', doc.id);
      expect(chunks.data).toEqual([{ content: 'Mix flour, water and salt.' }]);

      await api().delete(`/documents/${doc.id}`).set(as(alice)).expect(204);
      const gone = await alice.db.from('document_chunks').select('id').eq('document_id', doc.id);
      expect(gone.data).toEqual([]);
    });
  });

  it('validates input with the shared schemas', async () => {
    const res = await api().post('/documents').set(as(alice)).send({ title: ' ', content: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'validation_failed', message: 'Title is required' });

    const tooLong = await api()
      .post('/documents')
      .set(as(alice))
      .send({ title: 'Big', content: 'a'.repeat(100_001) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toMatch(/at most 100,000 characters/);
  });
});
