'use client';

import { signOut } from '../login/actions';
import { clearChatHistory } from './chat/chat-panel';

export function SignOutButton() {
  return (
    <form
      action={signOut}
      // Chat history lives in this browser tab only; do not leave it behind.
      onSubmit={clearChatHistory}
    >
      <button type="submit" className="text-sm hover:underline">
        Sign out
      </button>
    </form>
  );
}
