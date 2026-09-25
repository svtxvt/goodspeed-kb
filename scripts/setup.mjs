#!/usr/bin/env node
// One-command local setup: `pnpm run setup`.
//   1. checks Node and Docker
//   2. installs dependencies
//   3. starts the local Supabase stack (Docker) and applies migrations
//   4. writes apps/api/.env and apps/web/.env.local from the .env.example files,
//      filling Supabase URL/keys from `supabase status`. Existing files are kept;
//      only empty Supabase values in them are filled in.
// Plain Node with no dependencies, so it runs before `pnpm install`.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function step(message) {
  console.log(`\n▶ ${message}`);
}

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

function run(command, { capture = false } = {}) {
  return execSync(command, { cwd: root, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
}

step('Checking prerequisites');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  fail(`Node >= 22.12 is required (found ${process.versions.node}).`);
}
try {
  run('docker info', { capture: true });
} catch {
  fail('Docker is not running. Start Docker Desktop (or another Docker engine) and retry.');
}

step('Installing dependencies');
run('pnpm install');

step('Starting local Supabase (first run downloads ~1.5 GB of images)');
run('pnpm exec supabase start');
step('Applying database migrations');
run('pnpm exec supabase migration up --local');

// `supabase status -o env` prints KEY="value" lines.
const status = Object.fromEntries(
  run('pnpm exec supabase status -o env', { capture: true })
    .split('\n')
    .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const supabaseUrl = status.API_URL;
const publishableKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
const serviceKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
if (!supabaseUrl || !publishableKey) fail('Could not read URL/keys from `supabase status`.');

/** Creates `target` from `example` if missing, then fills the given keys where empty. */
function writeEnv(example, target, values) {
  const examplePath = join(root, example);
  const targetPath = join(root, target);
  const created = !existsSync(targetPath);
  let text = readFileSync(created ? examplePath : targetPath, 'utf8');
  const filled = [];
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=(.*)$`, 'm');
    const current = pattern.exec(text);
    if (current && current[1].trim() !== '' && !created) continue; // keep the user's value
    text = current ? text.replace(pattern, `${key}=${value}`) : `${text.trimEnd()}\n${key}=${value}\n`;
    filled.push(key);
  }
  writeFileSync(targetPath, text);
  const what = created ? 'created' : filled.length ? `kept, filled ${filled.join(', ')}` : 'kept as is';
  console.log(`  ${relative(root, targetPath)}: ${what}`);
}

step('Writing environment files');
writeEnv('apps/api/.env.example', 'apps/api/.env', {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
});
writeEnv('apps/web/.env.example', 'apps/web/.env.local', {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
});

console.log(`
✔ Setup complete.

  pnpm dev          start the web app (http://localhost:3000) and the API (http://localhost:4000)
  pnpm test         run all tests (API tests use the local Supabase stack)

The API starts in MOCK AI mode (AI_MOCK=true in apps/api/.env). Set your
provider there to get real answers; see README "Swapping AI providers".
`);
