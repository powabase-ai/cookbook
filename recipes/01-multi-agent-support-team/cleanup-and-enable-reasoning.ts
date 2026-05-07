// Recipe 01 — One-shot cleanup + reasoning-enable
//
// 1. Lists orchestrations; deletes any "Customer Support Team" that has 0
//    entities (orphans from a partial seed run).
// 2. PATCHes the remaining orchestration's orchestrator_config to enable
//    reasoning_effort, so reasoning_delta + reasoning events stream from
//    the coordinator. Gated on model support — if the orchestrator's model
//    doesn't support reasoning, the platform skips reasoning emission
//    silently and the change is harmless.
//
// Run:
//   npx tsx cleanup-and-enable-reasoning.ts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = process.env.VITE_POWABASE_URL!;
const API_KEY = process.env.POWABASE_SERVICE_ROLE_KEY!;

const headers = {
  apikey: API_KEY,
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

interface OrchSummary {
  id: string;
  name: string;
  strategy?: string;
  orchestrator_config?: Record<string, unknown> | null;
}

interface EntitySummary {
  id: string;
  entity_ref_id: string;
  role_description?: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function main() {
  const list = await api<{ orchestrations?: OrchSummary[] } | OrchSummary[]>(
    "/api/orchestrations",
  );
  const orchestrations = Array.isArray(list) ? list : (list.orchestrations ?? []);
  console.log(`Found ${orchestrations.length} orchestration(s)`);

  // Find duplicates by name
  const supportTeams = orchestrations.filter(
    (o) => o.name === "Customer Support Team",
  );
  console.log(`  ${supportTeams.length} named "Customer Support Team"`);

  let kept: OrchSummary | null = null;

  for (const o of supportTeams) {
    const ents = await api<{ entities?: EntitySummary[] } | EntitySummary[]>(
      `/api/orchestrations/${o.id}/entities`,
    );
    const entityCount = Array.isArray(ents)
      ? ents.length
      : (ents.entities ?? []).length;
    console.log(`  ${o.id.slice(0, 8)}… has ${entityCount} entit(ies)`);

    if (entityCount === 0) {
      console.log(`    → deleting empty orphan ${o.id.slice(0, 8)}…`);
      await fetch(`${BASE_URL}/api/orchestrations/${o.id}`, {
        method: "DELETE",
        headers,
      });
    } else {
      kept = o;
    }
  }

  if (!kept) {
    throw new Error(
      "No surviving orchestration to enable reasoning on. Re-run `npm run seed`.",
    );
  }

  console.log(`\nKept orchestration ${kept.id}`);
  console.log(`  current orchestrator_config: ${JSON.stringify(kept.orchestrator_config) ?? "null"}`);

  // PATCH the orchestrator_config to request reasoning. The platform probes
  // model support at run time and silently skips if unsupported.
  const newConfig = {
    ...(kept.orchestrator_config ?? {}),
    reasoning_effort: "medium",
  };

  console.log(`  PATCH orchestrator_config = ${JSON.stringify(newConfig)}`);

  const res = await fetch(`${BASE_URL}/api/orchestrations/${kept.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ orchestrator_config: newConfig }),
  });
  if (!res.ok) {
    console.log(`  PATCH failed: ${res.status} ${await res.text()}`);
    return;
  }
  console.log(`  ✓ PATCH succeeded`);

  console.log(
    `\nDone. The keeper orchestration id: ${kept.id}\n` +
      `If your code/.env.local has a stale VITE_POWABASE_ORCHESTRATION_ID,\n` +
      `update it to ${kept.id} and reload the dev server.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
