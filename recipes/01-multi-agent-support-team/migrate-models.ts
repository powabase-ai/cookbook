// Recipe 01 — One-shot migration from gpt-4o-mini to gpt-5.4-mini
//
// Updates each entity agent in this project to:
//   - model: gpt-5.4-mini  (gpt-4o-mini is retired)
//   - settings.reasoning_effort: "medium"  (enables reasoning streaming)
//
// Idempotent: matches agents by name and PATCHes them.
//
// Run:
//   npx tsx migrate-models.ts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = process.env.VITE_POWABASE_URL!;
const API_KEY = process.env.POWABASE_SERVICE_ROLE_KEY!;

const headers = {
  apikey: API_KEY,
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

interface AgentSummary {
  id: string;
  name: string;
  model?: string;
  settings?: Record<string, unknown> | null;
}

const targets = ["billing-agent", "technical-agent", "product-agent"];
const NEW_MODEL = "gpt-5.4-mini";

async function main() {
  const res = await fetch(`${BASE_URL}/api/agents`, { headers });
  if (!res.ok) throw new Error(`list agents: ${res.status}`);
  const json = (await res.json()) as { agents?: AgentSummary[] } | AgentSummary[];
  const agents = Array.isArray(json) ? json : (json.agents ?? []);
  console.log(`Found ${agents.length} agents`);

  for (const target of targets) {
    const matches = agents.filter((a) => a.name === target);
    if (matches.length === 0) {
      console.log(`  ✗ ${target}: not found`);
      continue;
    }
    for (const a of matches) {
      const newSettings = {
        ...(a.settings ?? {}),
        reasoning_effort: "medium",
      };
      const patchRes = await fetch(`${BASE_URL}/api/agents/${a.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          model: NEW_MODEL,
          settings: newSettings,
        }),
      });
      if (!patchRes.ok) {
        console.log(`  ✗ ${a.name} (${a.id.slice(0, 8)}…): ${patchRes.status} ${await patchRes.text()}`);
      } else {
        console.log(
          `  ✓ ${a.name} (${a.id.slice(0, 8)}…): model=${NEW_MODEL}, reasoning_effort=medium`,
        );
      }
    }
  }

  console.log("\nDone. Re-run `npm run dogfood` to validate.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
