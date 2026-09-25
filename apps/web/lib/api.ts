// Server-side client for the NestJS API. Only the Next.js server talks to the
// API: the browser never sees the API URL or needs CORS.
import type { ApiErrorBody } from '@kb/shared';
import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from './supabase-server';

export class ApiError extends Error {
  constructor(readonly body: ApiErrorBody) {
    super(body.message);
  }

  get status() {
    return this.body.statusCode;
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const supabase = await createSupabaseServerClient();
  // getSession() only reads the cookie; that is fine here because the API
  // verifies the token itself (proxy.ts already refreshed it).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect('/login');

  let response: Response;
  try {
    response = await fetch(`${process.env.API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError({
      statusCode: 503,
      error: 'api_unreachable',
      message: 'The API is not reachable. Is it running (pnpm dev)?',
    });
  }

  if (response.status === 401) redirect('/login');
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      body ?? { statusCode: response.status, error: 'error', message: response.statusText },
    );
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** Turns an API failure into a message for the UI; rethrows anything else. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  throw error;
}
