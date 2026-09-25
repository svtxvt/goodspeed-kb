import type { HealthDto } from '@kb/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { SignOutButton } from './sign-out-button';

async function getHealth(): Promise<HealthDto | null> {
  try {
    const res = await fetch(`${process.env.API_URL}/health`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as HealthDto) : null;
  } catch {
    return null;
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const health = await getHealth();

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <nav aria-label="Main" className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <span className="font-semibold">Knowledge Base</span>
          <Link href="/documents" className="text-sm hover:underline">
            Documents
          </Link>
          <Link href="/chat" className="text-sm hover:underline">
            Ask
          </Link>
          <span className="ml-auto">
            <SignOutButton />
          </span>
        </nav>
      </header>

      {!health && (
        <p role="status" className="bg-red-50 px-4 py-2 text-center text-sm text-red-800">
          The API is not reachable. Start it with <code>pnpm dev</code>.
        </p>
      )}
      {health?.ai.mock && (
        <p role="status" className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          <strong>Mock AI mode:</strong> answers are templated, not generated. Set a provider in{' '}
          <code>apps/api/.env</code> to get real answers.
        </p>
      )}

      <main id="main" className="mx-auto max-w-4xl px-4 py-8">
        {children}
      </main>
    </>
  );
}
