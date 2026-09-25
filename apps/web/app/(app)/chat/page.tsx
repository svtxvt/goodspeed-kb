import { redirect } from 'next/navigation';

import { createSupabaseServerClient } from '@/lib/supabase-server';

import { ChatPanel } from './chat-panel';

export default async function ChatPage() {
  // getClaims() verifies the JWT, so the storage key is tied to a real identity.
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ask your documents</h1>
        <p className="text-sm text-slate-600">
          The assistant is instructed to answer only from your documents and to cite them; check the
          sources it shows. The conversation is kept in this browser tab until you sign out.
        </p>
      </div>
      <ChatPanel key={userId} userId={userId} />
    </div>
  );
}
