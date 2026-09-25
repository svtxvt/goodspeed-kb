'use client';

import { CHAT_LIMITS, type CitationDto } from '@kb/shared';
import Link from 'next/link';
import { useState, useSyncExternalStore, useTransition } from 'react';

import { askQuestion } from './actions';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citations?: CitationDto[];
  grounded?: boolean;
}

// The conversation lives in sessionStorage under a key that includes the
// verified user id: it survives navigation and reloads in this tab, another
// account signing in here never sees it, and sign-out removes it.
const STORAGE_PREFIX = 'kb:chat-history:';
const CHANGE_EVENT = 'kb:chat-history-change';
const subscribe = (onChange: () => void) => {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
};

/** Removes every stored conversation in this tab (called on sign-out). */
export function clearChatHistory(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key);
  }
}

/** Render with `key={userId}` so a different identity always gets a fresh panel. */
export function ChatPanel({ userId }: { userId: string }) {
  const storageKey = `${STORAGE_PREFIX}${userId}`;
  const stored = useSyncExternalStore(
    subscribe,
    () => sessionStorage.getItem(storageKey) ?? '[]',
    () => '[]',
  );
  const turns = JSON.parse(stored) as Turn[];
  const writeHistory = (next: Turn[]) => {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = question.trim();
    if (!text || pending) return;
    setError(null);

    const history = turns.slice(-CHAT_LIMITS.historyMessagesMax).map(({ role, content }) => ({
      role,
      content: content.slice(0, CHAT_LIMITS.historyMessageMax),
    }));

    startTransition(async () => {
      const result = await askQuestion({ userId, question: text, history });
      if ('error' in result) {
        setError(result.error); // the question stays in the input
        return;
      }
      writeHistory([
        ...turns,
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: result.answer,
          citations: result.citations,
          grounded: result.grounded,
        },
      ]);
      setQuestion('');
    });
  }

  return (
    <div className="space-y-6">
      {turns.length > 0 && (
        <ol aria-label="Conversation" className="space-y-4">
          {turns.map((turn, i) => (
            <li
              key={i}
              className={
                turn.role === 'user'
                  ? 'ml-12 rounded-lg bg-blue-50 px-4 py-3'
                  : 'mr-12 rounded-lg border border-slate-200 bg-white px-4 py-3'
              }
            >
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                {turn.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <p
                className={`whitespace-pre-wrap ${turn.grounded === false ? 'text-slate-600 italic' : ''}`}
              >
                {turn.content}
              </p>
              {turn.citations && turn.citations.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <p className="text-xs font-medium text-slate-600">Sources</p>
                  <ol className="mt-1 space-y-2">
                    {turn.citations.map((citation) => (
                      <li key={citation.n} className="text-sm">
                        <span className="font-mono text-slate-500">[{citation.n}]</span>{' '}
                        <Link
                          href={`/documents/${citation.documentId}`}
                          className="font-medium underline"
                        >
                          {citation.documentTitle}
                        </Link>
                        <p className="text-slate-600">{citation.excerpt}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div aria-live="polite" className="text-sm">
        {pending && <p className="text-slate-600">Searching your documents…</p>}
        {error && (
          <p role="alert" className="alert">
            {error}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="question" className="label">
          Ask a question about your documents
        </label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={3}
          maxLength={CHAT_LIMITS.questionMax}
          aria-describedby="question-hint"
          className="input"
        />
        <p id="question-hint" className="text-xs text-slate-600">
          Enter to send, Shift+Enter for a new line. Follow-up questions use the conversation so
          far.
        </p>
        <div className="flex gap-3">
          <button type="submit" disabled={pending || !question.trim()} className="btn-primary">
            {pending ? 'Asking…' : 'Ask'}
          </button>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => writeHistory([])}
              disabled={pending}
              className="btn-secondary"
            >
              New conversation
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
