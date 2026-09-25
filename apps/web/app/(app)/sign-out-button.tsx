'use client';

import { signOut } from '../login/actions';
import { CHAT_STORAGE_KEY } from './chat/chat-panel';

export function SignOutButton() {
  return (
    <form
      action={signOut}
      // The chat history lives in this browser tab only; do not leave it behind.
      onSubmit={() => sessionStorage.removeItem(CHAT_STORAGE_KEY)}
    >
      <button type="submit" className="text-sm hover:underline">
        Sign out
      </button>
    </form>
  );
}
