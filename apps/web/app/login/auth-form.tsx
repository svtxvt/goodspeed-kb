'use client';

import { useActionState } from 'react';

import { authenticate } from './actions';

export function AuthForm() {
  const [state, action, pending] = useActionState(authenticate, {});

  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="input"
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-describedby="password-hint"
          className="input"
        />
        <p id="password-hint" className="mt-1 text-xs text-slate-600">
          At least 6 characters. New here? Enter an email and password, then choose Create account.
        </p>
      </div>

      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="alert">
            {state.error}
          </p>
        )}
        {state.message && <p className="text-sm text-slate-700">{state.message}</p>}
      </div>

      <div className="flex gap-3">
        <button type="submit" name="intent" value="sign-in" disabled={pending} className="btn-primary">
          Sign in
        </button>
        <button type="submit" name="intent" value="sign-up" disabled={pending} className="btn-secondary">
          Create account
        </button>
      </div>
    </form>
  );
}
