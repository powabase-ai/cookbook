// Plain fetch helpers for the Powabase-specific endpoints (orchestrations)
// that aren't part of the Supabase SDK surface.
//
// Auth: uses the current user's access token (from supabase.auth.getSession())
// so RLS applies to any PostgREST calls made alongside these.
//
// There is intentionally no `createAgentSession()` helper — sessions are
// created implicitly by the run endpoint when you pass `session_id: null`.
// Capture the returned session id from the `start` event and persist it to
// your own chat_sessions table for reuse on later messages.

import { supabase } from "./supabase";
import type { OrchestrationEvent } from "../types/orchestration-events";

const BASE_URL = import.meta.env.VITE_POWABASE_URL!;
const ANON_KEY = import.meta.env.VITE_POWABASE_ANON_KEY!;
const ORCH_ID = import.meta.env.VITE_POWABASE_ORCHESTRATION_ID!;

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
}

export async function* streamOrchestrationRun(params: {
  message: string;
  sessionId: string | null;
}): AsyncGenerator<OrchestrationEvent> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/orchestrations/${ORCH_ID}/run/stream`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: params.message,
      session_id: params.sessionId,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(
      `streamOrchestrationRun: ${res.status} ${await res.text()}`,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are delimited by "\n\n"; keep the trailing (possibly partial)
    // frame in the buffer for the next iteration.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;
        try {
          yield JSON.parse(payload) as OrchestrationEvent;
        } catch {
          // Ignore malformed frames (e.g. keepalive lines that start with ":")
        }
      }
    }
  }
}
