import { ChatPanel } from './chat-panel';

export default function ChatPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ask your documents</h1>
        <p className="text-sm text-slate-600">
          Answers use only your documents and cite them. The conversation is kept in this browser tab until
          you sign out.
        </p>
      </div>
      <ChatPanel />
    </div>
  );
}
