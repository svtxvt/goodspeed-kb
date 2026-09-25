import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * The service-role key of the LOCAL Supabase stack, read from `supabase status`
 * when needed, so it is never written to an .env file the API loads. Returns
 * undefined when the local stack is not running.
 */
export function localServiceRoleKey(): string | undefined {
  try {
    const status = execFileSync(
      join(repoRoot, 'node_modules', '.bin', 'supabase'),
      ['status', '-o', 'env', '--workdir', repoRoot],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return /^(?:SECRET_KEY|SERVICE_ROLE_KEY)="?([^"\n]+)"?$/m.exec(status)?.[1];
  } catch {
    return undefined;
  }
}
