'use client';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="space-y-3">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-slate-700">{error.message || 'Please try again.'}</p>
      <button type="button" onClick={reset} className="btn-secondary">
        Try again
      </button>
    </div>
  );
}
