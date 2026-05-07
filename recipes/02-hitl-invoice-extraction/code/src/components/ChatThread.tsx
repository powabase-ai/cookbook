import { useState, type FormEvent } from "react";
import type { ChatMessage } from "../hooks/useChatThread";

interface Props {
  messages: ChatMessage[];
  onSend: (content: string) => Promise<void>;
  onAtAgent: (hint: string) => Promise<void>;
}

export default function ChatThread({ messages, onSend, onAtAgent }: Props) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      const trimmed = draft.trim();
      if (trimmed.startsWith("@agent ")) {
        await onAtAgent(trimmed.slice("@agent ".length));
      } else {
        await onSend(trimmed);
      }
      setDraft("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <h3 className="font-semibold text-sm mb-2">Discussion</h3>
      <div className="flex-1 overflow-auto space-y-2 mb-2">
        {messages.length === 0 && (
          <p className="text-xs text-gray-500">
            No messages. Type <code>@agent &lt;hint&gt;</code> to ask the
            extractor to re-examine a field.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              "p-2 rounded text-sm " +
              (m.author_is_agent ? "bg-purple-50" : "bg-gray-50")
            }
          >
            <div className="text-xs text-gray-500 mb-1">
              {m.author_display_name ?? "(unknown)"}
              {m.author_is_agent && " · agent"}
              {" · "}
              {new Date(m.created_at).toLocaleTimeString()}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={submitting}
          placeholder="Type a message, or @agent <hint>"
          className="flex-1 border rounded p-1 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !draft.trim()}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          {submitting ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
