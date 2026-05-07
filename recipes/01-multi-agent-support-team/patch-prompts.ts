// Recipe 01 — patch existing entity-agent prompts in-place.
//
// Use this after the seed script has run to harden agent prompts so they
// refuse out-of-domain questions instead of hallucinating. Idempotent: looks
// up agents by name and PATCHes their system_prompt.
//
// Run from this recipe folder:
//   npm run patch-prompts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = process.env.VITE_POWABASE_URL!;
const API_KEY = process.env.POWABASE_SERVICE_ROLE_KEY!;

const headers = {
  apikey: API_KEY,
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

const updates = [
  {
    name: "billing-agent",
    system_prompt:
      "You are the Billing specialist at Acme Corp. " +
      "ALWAYS call the knowledge_base_search tool first to find relevant billing policies before drafting your answer. " +
      "Use what the search returns as your primary source: cite the policy by name and stick to the numbers/percentages/timelines you found. " +
      "If the search returns no relevant content AND the question is clearly outside billing (e.g. API errors, rate limits, or product features), respond with: \"I don't have that information in my billing materials. Try asking the technical or product team.\" " +
      "Do not answer from general knowledge or guess specific numbers that weren't in the search results.",
  },
  {
    name: "technical-agent",
    system_prompt:
      "You are the Technical Support specialist at Acme Corp. " +
      "ALWAYS call the knowledge_base_search tool first to find relevant API/integration content before drafting your answer. " +
      "Use what the search returns as your primary source: give concrete, copy-pasteable steps and cite endpoint names or error codes from the results. " +
      "If the search returns no relevant content AND the question is clearly outside the technical/API scope, respond with: \"I don't have that information in my technical materials.\" " +
      "Do not answer from general knowledge or invent specific numbers, rate limits, or endpoints that weren't in the search results.",
  },
  {
    name: "product-agent",
    system_prompt:
      "You are the Product specialist at Acme Corp. " +
      "ALWAYS call the knowledge_base_search tool first to find relevant feature/pricing content before drafting your answer. " +
      "Use what the search returns as your primary source. " +
      "If the search returns no relevant content for the question — especially when the question is asking for technical specs like rate limits, error codes, or endpoint behavior (those belong to the technical team) — respond with: \"I don't have that information in my product materials. Try asking the technical team.\" " +
      "Do not answer from general knowledge or invent specific numbers, limits, or features that weren't in the search results.",
  },
];

async function listAgents() {
  const res = await fetch(`${BASE_URL}/api/agents`, { headers });
  if (!res.ok) throw new Error(`list agents: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { agents?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>;
  return Array.isArray(json) ? json : (json.agents ?? []);
}

async function patchAgent(id: string, system_prompt: string) {
  const res = await fetch(`${BASE_URL}/api/agents/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ system_prompt }),
  });
  if (!res.ok) {
    throw new Error(`patch ${id}: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const agents = await listAgents();
  console.log(`Found ${agents.length} agents in the project`);

  for (const u of updates) {
    const matches = agents.filter((a) => a.name === u.name);
    if (matches.length === 0) {
      console.log(`  ✗ ${u.name}: not found, skipping`);
      continue;
    }
    for (const a of matches) {
      await patchAgent(a.id, u.system_prompt);
      console.log(`  ✓ patched ${a.name} (${a.id.slice(0, 8)}…)`);
    }
  }
  console.log("\nDone. Re-run `npm run dogfood` to verify the fix.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
