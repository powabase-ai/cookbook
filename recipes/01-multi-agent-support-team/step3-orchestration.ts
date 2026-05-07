// Recipe 01 — Step 3: Compose with a Supervisor orchestration
//
// Creates a Supervisor orchestration and attaches the three specialists
// (billing / technical / product) as entities. The coordinator's prompt
// is auto-built from the orchestration's `description`, the
// `orchestrator_config.additional_instructions`, and each entity's
// `role_description`. You don't write the routing prompt by hand — it
// emerges from the role descriptions you give.
//
// Idempotent: re-uses the orchestration if one already exists by name,
// and skips entity attach for entities that are already wired up.
//
// Run:
//   npm run step:3

import {
  api,
  findAgentByName,
  findOrchestrationByName,
  streamOrchestrationChat,
  type Orchestration,
} from "./seed-helpers.js";

const ORCH_NAME = "Customer Support Team";

const ORCH_DESCRIPTION =
  "Acme Corp customer support. Route each end-user question to the right specialist " +
  "(billing, technical, or product) and return a synthesized answer.";

const ADDITIONAL_INSTRUCTIONS =
  "Default to delegating. Do not answer from general knowledge — that is the specialists' job. " +
  "Pick the single most likely specialist; only fan out to multiple specialists when the question genuinely spans domains. " +
  "When you respond to the user, synthesize the specialist's answer in your own voice rather than echoing it verbatim.";

const ROLES = [
  {
    agentName: "billing-agent",
    role: "Handles billing inquiries, invoices, payment issues, refunds, and tax questions.",
  },
  {
    agentName: "technical-agent",
    role: "Handles technical questions, API errors, integration setup, and debugging.",
  },
  {
    agentName: "product-agent",
    role: "Handles questions about product features, pricing plans, and tier comparisons.",
  },
];

interface Entity {
  id: string;
  entity_type: string;
  entity_ref_id: string;
}

export async function provisionOrchestration(): Promise<Orchestration> {
  // 1. Orchestration — create if missing.
  let orch = await findOrchestrationByName(ORCH_NAME);
  if (orch) {
    console.log(`✓ Orchestration "${ORCH_NAME}" exists (${orch.id.slice(0, 8)}…)`);
  } else {
    console.log(`→ Creating Supervisor orchestration "${ORCH_NAME}"`);
    orch = await api<Orchestration>("/api/orchestrations", {
      method: "POST",
      body: JSON.stringify({
        name: ORCH_NAME,
        description: ORCH_DESCRIPTION,
        strategy: "supervisor",
        orchestrator_config: {
          additional_instructions: ADDITIONAL_INSTRUCTIONS,
          // `reasoning_effort` makes the coordinator emit reasoning_delta
          // events. The platform silently no-ops if the model doesn't
          // support reasoning.
          reasoning_effort: "medium",
        },
      }),
    });
    console.log(`  id: ${orch.id}`);
  }

  // 2. Attach each specialist as an entity. Each entity carries a
  //    `role_description` — that text is what the coordinator sees as the
  //    delegation tool's description, and the basis on which it routes.
  const existingEntities = await api<{ entities?: Entity[] } | Entity[]>(
    `/api/orchestrations/${orch.id}/entities`,
  );
  const entities = Array.isArray(existingEntities)
    ? existingEntities
    : (existingEntities.entities ?? []);
  const attachedAgentIds = new Set(
    entities
      .filter((e) => e.entity_type === "agent")
      .map((e) => e.entity_ref_id),
  );

  for (const { agentName, role } of ROLES) {
    const agent = await findAgentByName(agentName);
    if (!agent) {
      throw new Error(
        `Agent "${agentName}" not found. Run npm run step:1 and step:2 first.`,
      );
    }
    if (attachedAgentIds.has(agent.id)) {
      console.log(`✓ ${agentName} already attached as entity`);
      continue;
    }
    console.log(`→ Attaching ${agentName} with role: "${role}"`);
    await api(`/api/orchestrations/${orch.id}/entities`, {
      method: "POST",
      body: JSON.stringify({
        entity_type: "agent",
        entity_ref_id: agent.id,
        role_description: role,
      }),
    });
  }

  return orch;
}

async function main() {
  const orch = await provisionOrchestration();
  console.log(`\n✓ Step 3 complete\n  orchestration: ${orch.id}\n`);
  console.log(`Paste this into code/.env.local:`);
  console.log(`  VITE_POWABASE_ORCHESTRATION_ID=${orch.id}\n`);

  // Probe via the orchestration endpoint. The same kinds of questions
  // that previously needed you to pick the agent now just go to one
  // endpoint — the coordinator routes.
  const probes = [
    "What's the refund window for Pro plan?",
    "How do I authenticate against your API?",
    "What's the difference between Business and Enterprise?",
  ];
  for (const question of probes) {
    console.log(`→ Asking the orchestration: "${question}"`);
    const { answer, delegatedTo } = await streamOrchestrationChat(
      orch.id,
      question,
    );
    console.log(`  delegated to: ${delegatedTo.join(", ") || "(no delegation)"}`);
    console.log(`  answer: ${answer.trim().slice(0, 200)}${answer.length > 200 ? "…" : ""}\n`);
  }

  console.log(
    "Notice: the routing emerged from the role descriptions — you didn't write the routing prompt.",
  );
}

const isDirectRun = process.argv[1]?.endsWith("step3-orchestration.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
