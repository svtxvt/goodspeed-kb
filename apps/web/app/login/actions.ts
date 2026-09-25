'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/lib/supabase-server';

export interface AuthState {
  error?: string;
  message?: string;
  email?: string;
}

const credentialsSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/** One action for both buttons; the clicked button's `intent` decides. */
export async function authenticate(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const parsed = credentialsSchema.safeParse({
    email,
    password: String(formData.get('password') ?? ''),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message, email };

  const supabase = await createSupabaseServerClient();
  if (formData.get('intent') === 'sign-up') {
    const { data, error } = await supabase.auth.signUp(parsed.data);
    if (error) return { error: error.message, email };
    // Local Supabase has email confirmation off, so sign-up returns a session.
    if (!data.session)
      return { message: 'Check your inbox to confirm your email, then sign in.', email };
  } else {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: error.message, email };
  }
  redirect('/documents');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
