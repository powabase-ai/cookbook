// Recipe 01 — Step 1: One specialist
//
// Provisions the simplest useful AI loop: one knowledge base + one agent
// with a knowledge_base_search tool, then chats with the agent directly
// (no orchestration yet) so you can see a single-agent loop work.
//
// Idempotent: if billing-kb / billing-agent already exist, they're reused.
// Re-running this script is safe.
//
// Run:
//   npm run step:1

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  api,
  uploadSource,
  pollSourceReady,
  findKBByName,
  findAgentByName,
  runAgent,
  type KB,
  type Agent,
} from "./seed-helpers.js";

const BILLING_PROMPT =
  "You are the Billing specialist at Acme Corp. " +
  "ALWAYS call the knowledge_base_search tool first to find relevant billing policies before drafting your answer. " +
  "Use what the search returns as your primary source: cite the policy by name and stick to the numbers/percentages/timelines you found. " +
  "If the search returns no relevant content AND the question is clearly outside billing (e.g. API errors, rate limits, or product features), respond with: \"I don't have that information in my billing materials. Try asking the technical or product team.\" " +
  "Do not answer from general knowledge or guess specific numbers that weren't in the search results.";

export async function provisionBilling(): Promise<{ kb: KB; agent: Agent }> {
  // 1. Knowledge base — create if missing.
  let kb = await findKBByName("billing-kb");
  if (kb) {
    console.log(`✓ KB billing-kb exists (${kb.id.slice(0, 8)}…) — skipping create + upload`);
  } else {
    console.log("→ Creating billing-kb");
    kb = await api<KB>("/api/knowledge-bases", {
      method: "POST",
      body: JSON.stringify({
        name: "billing-kb",
        description:
          "Billing policies, refund procedures, payment handling, tax info.",
        indexing_strategy: "chunk_embed",
        embedding_model: "text-embedding-3-small",
      }),
    });
    console.log(`  id: ${kb.id}`);

    // 2. Upload billing seed docs and wait for extraction.
    console.log("→ Uploading billing seed-content/");
    const dir = "seed-content/billing";
    for (const file of await readdir(dir)) {
      const src = await uploadSource(kb.id, join(dir, file));
      process.stdout.write(`  ${file} (${src.id.slice(0, 8)}…) extracting…`);
      await pollSourceReady(src.id);
      console.log(" ready");
    }
  }

  // 3. Agent — create if missing. The `knowledge_base_search` tool wires
  //    this agent to the KB; the agent calls it as part of its ReAct loop.
  let agent = await findAgentByName("billing-agent");
  if (agent) {
    console.log(`✓ Agent billing-agent exists (${agent.id.slice(0, 8)}…)`);
  } else {
    console.log("→ Creating billing-agent");
    agent = await api<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify({
        name: "billing-agent",
        model: "gpt-5.4-mini",
        system_prompt: BILLING_PROMPT,
        settings: { reasoning_effort: "medium" },
        tools: [{ type: "knowledge_base_search", knowledge_base_id: kb.id }],
      }),
    });
    console.log(`  id: ${agent.id}`);
  }

  return { kb, agent };
}

async function main() {
  const { kb, agent } = await provisionBilling();
  console.log(
    `\n✓ Step 1 complete\n  billing-kb:    ${kb.id}\n  billing-agent: ${agent.id}\n`,
  );

  // Chat directly with the agent — no orchestration yet. This is the
  // smallest working AI loop on Powabase: a single agent with one KB.
  const question = "What's the refund window for Pro plan?";
  console.log(`→ Asking billing-agent directly: "${question}"`);
  const answer = await runAgent(agent.id, question);
  console.log("\n--- billing-agent's answer ---\n" + answer.trim());

  console.log("\nNext: npm run step:2 (add technical + product specialists)");
}

const isDirectRun = process.argv[1]?.endsWith("step1-billing.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
