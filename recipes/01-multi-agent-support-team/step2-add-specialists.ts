// Recipe 01 — Step 2: Add two more specialists
//
// Repeats the step-1 pattern for the technical and product domains. After
// this, you have three independent agents — each capable of answering
// questions in its own domain. To get the right answer to a user, you'd
// have to know which agent to ask. That pain motivates step 3.
//
// Idempotent: re-uses any KB / agent that already exists by name.
//
// Run:
//   npm run step:2

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

interface Domain {
  name: string;
  contentDir: string;
  kbDescription: string;
  agentPrompt: string;
}

const domains: Domain[] = [
  {
    name: "technical",
    contentDir: "seed-content/technical",
    kbDescription:
      "API setup, integration guides, error codes, troubleshooting.",
    agentPrompt:
      "You are the Technical Support specialist at Acme Corp. " +
      "ALWAYS call the knowledge_base_search tool first to find relevant API/integration content before drafting your answer. " +
      "Use what the search returns as your primary source: give concrete, copy-pasteable steps and cite endpoint names or error codes from the results. " +
      "If the search returns no relevant content AND the question is clearly outside the technical/API scope, respond with: \"I don't have that information in my technical materials.\" " +
      "Do not answer from general knowledge or invent specific numbers, rate limits, or endpoints that weren't in the search results.",
  },
  {
    name: "product",
    contentDir: "seed-content/product",
    kbDescription:
      "Plans and pricing, feature matrix, product capabilities.",
    agentPrompt:
      "You are the Product specialist at Acme Corp. " +
      "ALWAYS call the knowledge_base_search tool first to find relevant feature/pricing content before drafting your answer. " +
      "Use what the search returns as your primary source. " +
      "If the search returns no relevant content for the question — especially when the question is asking for technical specs like rate limits, error codes, or endpoint behavior (those belong to the technical team) — respond with: \"I don't have that information in my product materials. Try asking the technical team.\" " +
      "Do not answer from general knowledge or invent specific numbers, limits, or features that weren't in the search results.",
  },
];

export async function provisionSpecialists(): Promise<
  Array<{ domain: Domain; kb: KB; agent: Agent }>
> {
  const out: Array<{ domain: Domain; kb: KB; agent: Agent }> = [];
  for (const domain of domains) {
    console.log(`\n=== ${domain.name.toUpperCase()} ===`);

    let kb = await findKBByName(`${domain.name}-kb`);
    if (kb) {
      console.log(`✓ KB ${domain.name}-kb exists (${kb.id.slice(0, 8)}…) — skipping create + upload`);
    } else {
      console.log(`→ Creating ${domain.name}-kb`);
      kb = await api<KB>("/api/knowledge-bases", {
        method: "POST",
        body: JSON.stringify({
          name: `${domain.name}-kb`,
          description: domain.kbDescription,
          indexing_strategy: "chunk_embed",
          embedding_model: "text-embedding-3-small",
        }),
      });

      console.log(`→ Uploading ${domain.contentDir}/`);
      for (const file of await readdir(domain.contentDir)) {
        const src = await uploadSource(kb.id, join(domain.contentDir, file));
        process.stdout.write(`  ${file} (${src.id.slice(0, 8)}…) extracting…`);
        await pollSourceReady(src.id);
        console.log(" ready");
      }
    }

    let agent = await findAgentByName(`${domain.name}-agent`);
    if (agent) {
      console.log(`✓ Agent ${domain.name}-agent exists (${agent.id.slice(0, 8)}…)`);
    } else {
      console.log(`→ Creating ${domain.name}-agent`);
      agent = await api<Agent>("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: `${domain.name}-agent`,
          model: "gpt-5.4-mini",
          system_prompt: domain.agentPrompt,
          settings: { reasoning_effort: "medium" },
          tools: [{ type: "knowledge_base_search", knowledge_base_id: kb.id }],
        }),
      });
    }

    out.push({ domain, kb, agent });
  }
  return out;
}

async function main() {
  const provisioned = await provisionSpecialists();
  console.log(`\n✓ Step 2 complete`);
  for (const { domain, kb, agent } of provisioned) {
    console.log(`  ${domain.name}-kb:    ${kb.id}`);
    console.log(`  ${domain.name}-agent: ${agent.id}`);
  }

  // One probe per specialist — shows each agent answers within its own
  // domain. Note: at this point you have to KNOW which agent to ask.
  const probes: Array<{ agentName: string; question: string }> = [
    { agentName: "technical-agent", question: "How do I authenticate against your API?" },
    { agentName: "product-agent", question: "What's the difference between Business and Enterprise?" },
  ];
  for (const { agentName, question } of probes) {
    const item = provisioned.find((p) => p.agent.name === agentName);
    if (!item) continue;
    console.log(`\n→ Asking ${agentName} directly: "${question}"`);
    const answer = await runAgent(item.agent.id, question);
    console.log(`\n--- ${agentName}'s answer ---\n${answer.trim()}`);
  }

  console.log(
    "\nNote: at this point your app has to know which agent to ask for each question.\n" +
      "Next: npm run step:3 to introduce a Supervisor orchestration that does the routing for you.",
  );
}

const isDirectRun = process.argv[1]?.endsWith("step2-add-specialists.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
