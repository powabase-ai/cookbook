// Non-supabase-js calls. The Vite app uses anon-key fetch with the user's
// JWT for these (the agent endpoints accept authenticated user JWTs).

import { supabase } from "./supabase";

const BASE_URL = import.meta.env.VITE_POWABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_POWABASE_ANON_KEY as string;

async function authedHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    apikey: ANON_KEY,
    Authorization: token ? `Bearer ${token}` : `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function getSourcePageTexts(
  sourceId: string,
): Promise<{ page: number; text: string }[]> {
  const headers = await authedHeaders();
  const res = await fetch(`${BASE_URL}/api/sources/${sourceId}/page-texts`, {
    headers,
  });
  if (!res.ok) throw new Error(`page-texts: ${res.status} ${await res.text()}`);
  // The endpoint returns { page_texts: string[], count: number } — flat array,
  // no page numbers. Map to {page, text}[] so callers can reference page
  // numbers in prompts (handy for the smudged-invoice case).
  const data = (await res.json()) as { page_texts?: string[]; count?: number };
  return (data.page_texts ?? []).map((text, i) => ({ page: i + 1, text }));
}

// Fetches the rendered page image for a source as a Blob.
//
// Powabase stores rendered page images as source derivatives keyed by
// `derivatives.image[N]` (0-based array). The download endpoint requires
// auth, which `<img src>` tags can't supply (no custom headers from
// browsers), so we fetch as a Blob with the user's JWT and let the caller
// turn it into an object URL. `page` is 1-based; we convert to the
// derivative array's 0-based `index`.
export async function fetchSourcePageImage(
  sourceId: string,
  page: number,
): Promise<Blob> {
  const headers = await authedHeaders();
  // The download endpoint streams bytes; drop Content-Type so the browser
  // doesn't send a JSON content type on a GET.
  delete headers["Content-Type"];
  const url = `${BASE_URL}/api/sources/${sourceId}/derivatives/image/download?index=${page - 1}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`page-image: ${res.status} ${await res.text()}`);
  return res.blob();
}

// Client-side agent run — uses the signed-in user's JWT for auth.
// Mirror of `runAgent` in the recipe-root `seed-helpers.ts`, which uses the
// service_role key. They aren't shared because the recipe-root scripts and
// the Vite app are different package boundaries with different auth
// surfaces; the duplication is intentional.
export async function runAgentNonStreaming(
  agentId: string,
  message: string,
  contextOverride?: string,
): Promise<string> {
  const headers = await authedHeaders();
  const res = await fetch(`${BASE_URL}/api/agents/${agentId}/run`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      ...(contextOverride ? { context_override: contextOverride } : {}),
    }),
  });
  if (!res.ok) throw new Error(`run: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    content?: string;
    status?: string;
    error?: string;
  };
  if (data.status !== "completed")
    throw new Error(`agent run failed: ${data.error ?? data.status}`);
  return data.content ?? "";
}

export function pageTextsToContext(
  pages: { page: number; text: string }[],
): string {
  return pages.map((p) => `[PAGE ${p.page}]\n${p.text}`).join("\n\n");
}

export function stripJsonFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
