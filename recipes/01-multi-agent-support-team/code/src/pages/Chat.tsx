import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { streamOrchestrationRun } from "../lib/powabase-api";
import type {
  OrchestrationEvent,
  StartEvent,
} from "../types/orchestration-events";
import ChatMessage from "../components/ChatMessage";
import ToolTracePanel from "../components/ToolTracePanel";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [traceEvents, setTraceEvents] = useState<OrchestrationEvent[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const agentSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          setSessionError("Not signed in");
          return;
        }

        const { data: existing, error: selErr } = await supabase
          .from("chat_sessions")
          .select("id, agent_session_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (selErr) throw selErr;

        if (existing && existing.length > 0) {
          agentSessionIdRef.current = existing[0].agent_session_id;
        }

        if (!cancelled) setSessionReady(true);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!cancelled) setSessionError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSend() {
    if (!draft.trim() || streaming) return;

    const userContent = draft;
    setMessages((m) => [...m, { role: "user", content: userContent }]);
    setDraft("");
    setStreaming(true);
    setTraceEvents([]);

    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    let assistantText = "";

    const setAssistantText = (text: string) => {
      assistantText = text;
      setMessages((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "assistant", content: assistantText };
        return next;
      });
    };

    try {
      for await (const ev of streamOrchestrationRun({
        message: userContent,
        sessionId: agentSessionIdRef.current,
      })) {
        setTraceEvents((t) => [...t, ev]);

        if (ev.event === "start") {
          const newSessionId = (ev as StartEvent).session_id;
          if (agentSessionIdRef.current !== newSessionId) {
            agentSessionIdRef.current = newSessionId;
            const { data: userData } = await supabase.auth.getUser();
            const user = userData.user;
            if (user) {
              const { data: existing } = await supabase
                .from("chat_sessions")
                .select("id")
                .eq("user_id", user.id)
                .eq("agent_session_id", newSessionId)
                .maybeSingle();
              if (!existing) {
                await supabase.from("chat_sessions").insert({
                  user_id: user.id,
                  agent_session_id: newSessionId,
                });
              }
            }
          }
        } else if (ev.event === "content_delta") {
          // β: true token-by-token streaming. Append each delta to the
          // assistant message as it arrives.
          const delta = (ev as { delta?: string }).delta ?? "";
          setAssistantText(assistantText + delta);
        } else if (ev.event === "chunk") {
          // Terminal chunk arrives at the end with the full content. If
          // we've been streaming via content_delta, the content already
          // matches; if not, this fills it in. Either way, take the chunk
          // as authoritative final content.
          const content = (ev as { content?: string }).content ?? "";
          if (content && content !== assistantText) {
            setAssistantText(content);
          }
        } else if (ev.event === "error") {
          const msg = (ev as { error?: string }).error ?? "Unknown error";
          setAssistantText(
            assistantText
              ? `${assistantText}\n\n⚠️ Error: ${msg}`
              : `⚠️ Error: ${msg}`,
          );
        }
        // Other events (reasoning, reasoning_delta, step_started, etc.)
        // flow to the trace panel via setTraceEvents above; rendered there.
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAssistantText(
        assistantText
          ? `${assistantText}\n\n⚠️ Error: ${msg}`
          : `⚠️ Error: ${msg}`,
      );
    } finally {
      setStreaming(false);
    }
  }

  if (sessionError) {
    return (
      <div className="p-6">
        <p className="text-red-600">Error: {sessionError}</p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-4 text-sm text-gray-600 underline"
        >
          Sign out and retry
        </button>
      </div>
    );
  }
  if (!sessionReady) {
    return <div className="p-6">Loading session…</div>;
  }

  return (
    <div className="flex h-screen">
      <main className="flex-1 flex flex-col">
        <header className="p-4 border-b flex justify-between items-center">
          <h1 className="font-semibold">Customer Support Chat</h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-600 hover:underline"
          >
            Sign out
          </button>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50">
          {messages.length === 0 && (
            <p className="text-gray-500 text-sm">
              Ask a question — billing, technical, or product — to see the
              orchestration route it to the right agent.
            </p>
          )}
          {messages.map((m, i) => (
            <ChatMessage key={i} message={m} />
          ))}
        </div>
        <footer className="p-4 border-t bg-white">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              disabled={streaming}
              placeholder="Ask a question…"
              className="flex-1 border rounded p-2"
            />
            <button
              onClick={onSend}
              disabled={streaming || !draft.trim()}
              className="bg-blue-600 text-white px-4 rounded disabled:opacity-50"
            >
              {streaming ? "…" : "Send"}
            </button>
          </div>
        </footer>
      </main>
      <aside className="w-96 border-l overflow-auto p-4 bg-gray-50">
        <ToolTracePanel events={traceEvents} />
      </aside>
    </div>
  );
}
