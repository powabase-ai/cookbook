// Recipe 02 — Shared helpers used by step scripts and seed-agents.ts.
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
  // /auth/v1 endpoints return empty body on 204; treat that as null.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ─── KBs ──────────────────────────────────────────────────────────────────
export interface KB { id: string; name: string }

export async function findKBByName(name: string): Promise<KB | null> {
  const list = await api<{ knowledge_bases?: KB[] } | KB[]>(
    "/api/knowledge-bases",
  );
  const kbs = Array.isArray(list) ? list : (list.knowledge_bases ?? []);
  return kbs.find((k) => k.name === name) ?? null;
}

// ─── Sources ──────────────────────────────────────────────────────────────
export async function uploadSource(
  kbId: string,
  filePath: string,
  mimeType = "application/pdf",
): Promise<{ id: string }> {
  const fileBuffer = await readFile(filePath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(fileBuffer)], { type: mimeType }),
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
  timeoutMs = 240_000, // PDFs take longer than markdown
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
        `Source ${sourceId} reached terminal-bad state: ${source.extraction_status}`,
      );
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(
    `Source ${sourceId} did not reach extracted state within ${timeoutMs}ms`,
  );
}

// Register an already-uploaded + extracted source into a KB. The platform's
// /api/sources/upload endpoint creates the source row but does NOT create
// the ai.indexed_sources linking record, so the source isn't searchable
// from the KB until this step runs. POST /api/knowledge-bases/:id/sources
// is the platform's primitive for the link.
export async function addSourceToKB(
  kbId: string,
  sourceId: string,
): Promise<void> {
  await api(`/api/knowledge-bases/${kbId}/sources`, {
    method: "POST",
    body: JSON.stringify({ source_id: sourceId }),
  });
}

// Returns the per-page text for a fully-extracted source. Used as
// context_override input to the extractor and field-extractor agents.
//
// The platform's /api/sources/:id/page-texts endpoint returns
// { page_texts: string[], count: number } — a flat array of page strings,
// no page numbers. We map to a {page, text}[] shape so callers can
// reference page numbers in prompts (handy for the smudged-invoice case).
export async function getSourcePageTexts(
  sourceId: string,
): Promise<{ page: number; text: string }[]> {
  const res = await api<{ page_texts?: string[]; count?: number }>(
    `/api/sources/${sourceId}/page-texts`,
  );
  return (res.page_texts ?? []).map((text, i) => ({ page: i + 1, text }));
}

// Concatenates page texts with a separator the agent can use to identify
// page boundaries (helpful for the smudged-invoice scenario where the real
// invoice number is on page 2).
export function pageTextsToContext(
  pages: { page: number; text: string }[],
): string {
  return pages.map((p) => `[PAGE ${p.page}]\n${p.text}`).join("\n\n");
}

// ─── Agents ───────────────────────────────────────────────────────────────
export interface Agent { id: string; name: string; system_prompt?: string }

export async function findAgentByName(name: string): Promise<Agent | null> {
  const list = await api<{ agents?: Agent[] } | Agent[]>("/api/agents");
  const agents = Array.isArray(list) ? list : (list.agents ?? []);
  return agents.find((a) => a.name === name) ?? null;
}

// Run an agent (non-streaming), with optional context_override (the page
// text we feed for invoice extraction). Returns the parsed `content` field.
//
// This helper is for SERVER-SIDE / SEED-SCRIPT use — auth is the
// service_role key. The Vite app has a parallel helper
// `runAgentNonStreaming` in `code/src/lib/powabase-api.ts` that uses the
// signed-in user's JWT instead. They aren't shared because they live in
// different package boundaries (recipe-root vs code/) and use different
// auth surfaces.
export async function runAgent(
  agentId: string,
  message: string,
  opts: { context_override?: string } = {},
): Promise<string> {
  const body: Record<string, unknown> = { message };
  if (opts.context_override) body.context_override = opts.context_override;
  const res = await api<{ content?: string; status?: string; error?: string }>(
    `/api/agents/${agentId}/run`,
    { method: "POST", body: JSON.stringify(body) },
  );
  if (res.status !== "completed") {
    throw new Error(`agent run failed: ${res.error ?? res.status}`);
  }
  return res.content ?? "";
}

// ─── Auth users (agent-backing identities) ─────────────────────────────────
// Service-role admin: create a confirmed auth.users row for one of our agents.
// Idempotent under sequential calls (used by seed-agents.ts in a for-of loop).
// NOT race-safe — concurrent calls may both attempt to create and the loser
// will throw on GoTrue's 422 duplicate-email response. Acceptable in
// recipe-scope; production would need an upsert RPC or advisory lock.
export async function findOrCreateAgentAuthUser(
  email: string,
  password: string,
): Promise<{ id: string; email: string; created: boolean }> {
  // First, see if it exists. /auth/v1/admin/users supports filtering by email.
  const listRes = await fetch(
    `${BASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: { apikey: API_KEY!, Authorization: `Bearer ${API_KEY}` } },
  );
  if (listRes.ok) {
    const data = (await listRes.json()) as {
      users?: { id: string; email: string }[];
    };
    const existing = (data.users ?? []).find((u) => u.email === email);
    if (existing) return { ...existing, created: false };
  }

  const createRes = await fetch(`${BASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: API_KEY!,
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!createRes.ok) {
    throw new Error(
      `Create agent auth user failed: ${createRes.status} ${await createRes.text()}`,
    );
  }
  const created = (await createRes.json()) as { id: string; email: string };
  return { ...created, created: true };
}

// ─── Profiles ─────────────────────────────────────────────────────────────
// Idempotent upsert against public.profiles via PostgREST. The schema's
// handle_new_user trigger creates a default profile on auth.users insert;
// we then upsert is_agent + display_name to override the defaults.
//
// CALLER MUST ensure authUserId belongs to a freshly-created agent-backing
// auth.users row. Calling this on a real human's UUID will silently flip
// their is_agent=true, granting them agent RLS privileges. seed-agents.ts
// is the only intended caller.
export async function ensureAgentProfile(
  authUserId: string,
  displayName: string,
): Promise<void> {
  await api<null>("/rest/v1/profiles", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      id: authUserId,
      display_name: displayName,
      is_agent: true,
    }),
  });
}
