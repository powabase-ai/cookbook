// Recipe 01 — Shared helpers used by step scripts and seed-agents.ts.
//
// Loads .env.local, exposes a typed `api()` against the Powabase project,
// plus small "find by name" lookups so each step script can be re-run
// safely (idempotent — existing KBs / agents / orchestrations are reused).

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export const BASE_URL = process.env.VITE_POWABASE_URL;
export const API_KEY = process.env.POWABASE_SERVICE_ROLE_KEY;

if (!BASE_URL || !API_KEY) {
  throw new Error(
    "Missing env vars. Set VITE_POWABASE_URL and POWABASE_SERVICE_ROLE_KEY in .env.local.",
  );
}

const headers = {
  apikey: API_KEY,
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`,
    );
  }
  return res.json() as Promise<T>;
}

export async function uploadSource(
  kbId: string,
  filePath: string,
): Promise<{ id: string }> {
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(fileBuffer)], { type: "text/markdown" }),
    basename(filePath),
  );
  form.append("knowledge_base_id", kbId);

  const res = await fetch(`${BASE_URL}/api/sources/upload`, {
    method: "POST",
    headers: { apikey: API_KEY!, Authorization: `Bearer ${API_KEY}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function pollSourceReady(
  sourceId: string,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const source = await api<{ extraction_status: string }>(
      `/api/sources/${sourceId}`,
    );
    if (source.extraction_status === "extracted") return;
    if (
      ["failed", "cancelled", "attention_required"].includes(
        source.extraction_status,
      )
    ) {
      throw new Error(
        `Source ${sourceId} reached terminal bad state: ${source.extraction_status}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(
    `Source ${sourceId} did not reach extracted state within ${timeoutMs}ms`,
  );
}

export interface KB { id: string; name: string }
export interface Agent { id: string; name: string }
export interface Orchestration { id: string; name: string }

export async function findKBByName(name: string): Promise<KB | null> {
  const list = await api<{ knowledge_bases?: KB[] } | KB[]>(
    "/api/knowledge-bases",
  );
  const kbs = Array.isArray(list) ? list : (list.knowledge_bases ?? []);
  return kbs.find((k) => k.name === name) ?? null;
}

export async function findAgentByName(name: string): Promise<Agent | null> {
  const list = await api<{ agents?: Agent[] } | Agent[]>("/api/agents");
  const agents = Array.isArray(list) ? list : (list.agents ?? []);
  return agents.find((a) => a.name === name) ?? null;
}

export async function findOrchestrationByName(
  name: string,
): Promise<Orchestration | null> {
  const list = await api<{ orchestrations?: Orchestration[] } | Orchestration[]>(
    "/api/orchestrations",
  );
  const orchs = Array.isArray(list) ? list : (list.orchestrations ?? []);
  return orchs.find((o) => o.name === name) ?? null;
}

// --- Chat probes (terminal output) --------------------------------------

// Single-agent non-streaming. We use the non-streaming /run endpoint here
// because the step-1 / step-2 demos only need to show the final answer in
// the terminal — readers see streaming demonstrated end-to-end in step 3
// (orchestration) and in the React app.
export async function runAgent(
  agentId: string,
  message: string,
): Promise<string> {
  const res = await api<{ content?: string; status?: string; error?: string }>(
    `/api/agents/${agentId}/run`,
    { method: "POST", body: JSON.stringify({ message }) },
  );
  if (res.status !== "completed") {
    throw new Error(`agent run failed: ${res.error ?? res.status}`);
  }
  return res.content ?? "";
}

export async function streamOrchestrationChat(
  orchestrationId: string,
  message: string,
): Promise<{ answer: string; delegatedTo: string[] }> {
  const res = await fetch(
    `${BASE_URL}/api/orchestrations/${orchestrationId}/run/stream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ message }),
    },
  );
  if (!res.ok) {
    throw new Error(`orchestration run/stream: ${res.status} ${await res.text()}`);
  }
  return readContentWithDelegations(res);
}

async function readContentWithDelegations(
  res: Response,
): Promise<{ answer: string; delegatedTo: string[] }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let answer = "";
  const delegatedTo: string[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame
        .split("\n")
        .find((l) => l.startsWith("data: "))
        ?.slice(6);
      if (!data) continue;
      try {
        const ev = JSON.parse(data);
        if (ev.event === "content_delta" && typeof ev.delta === "string") {
          answer += ev.delta;
        } else if (ev.event === "delegation_started" && ev.agent) {
          delegatedTo.push(ev.agent);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return { answer, delegatedTo };
}
