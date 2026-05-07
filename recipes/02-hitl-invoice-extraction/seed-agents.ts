// Recipe 02 — Provision the three agents + their backing auth.users + profiles.
//
// Idempotent: if an agent / auth user / profile already exists, it's reused.
// Re-running is safe.
//
// Run:
//   npm run seed:agents

import {
  API_KEY,
  BASE_URL,
  api,
  ensureAgentProfile,
  findAgentByName,
  findOrCreateAgentAuthUser,
  type Agent,
} from "./seed-helpers.js";

const EXTRACTOR_PROMPT =
  "You extract structured data from invoice PDFs. The full page text is provided in CONTEXT, " +
  "with page boundaries marked as [PAGE N]. " +
  "Emit a JSON object matching this schema exactly:\n" +
  "{\n" +
  '  "vendor": { "name": <string>, "address": <string|null>, "_confidence": <0..1> },\n' +
  '  "invoice_number": { "value": <string>, "_confidence": <0..1> },\n' +
  '  "invoice_date": { "value": <ISO date string>, "_confidence": <0..1> },\n' +
  '  "due_date":     { "value": <ISO date string>, "_confidence": <0..1> },\n' +
  '  "line_items": [ { "description": <string>, "quantity": <number|null>, "unit_price": <number|null>, "amount": <number>, "_confidence": <0..1> } ],\n' +
  '  "subtotal": { "value": <number>, "_confidence": <0..1> },\n' +
  '  "tax":      { "value": <number>, "_confidence": <0..1> },\n' +
  '  "total":    { "value": <number>, "_confidence": <0..1> }\n' +
  "}\n" +
  "RULES:\n" +
  "- _confidence is your honest assessment 0..1 of how sure you are about each field.\n" +
  "- Drop confidence below 0.7 when extracting tabular data with many similar rows or smudged source text.\n" +
  "- For amounts, strip the currency symbol and emit a plain number. If the currency is unfamiliar (non-USD), set vendor._confidence and total._confidence ≤ 0.7 to flag for review.\n" +
  "- If a document has multiple identifier-shaped strings (reference number, customer ID, invoice number), use the canonical INVOICE NUMBER. Look across all pages.\n" +
  "- Do NOT compute or emit _arithmetic_valid — the database trigger handles that.\n" +
  "Output ONLY the JSON object, no commentary, no markdown fences.";

const FIELD_EXTRACTOR_PROMPT =
  "You re-extract a SINGLE field from an invoice PDF. The full page text is provided in CONTEXT, " +
  "with page boundaries marked as [PAGE N]. The user message will give you:\n" +
  "  TARGET_FIELD: <field path>\n" +
  "  HINT: <reviewer's hint about where to look or what format to expect>\n" +
  "  CURRENT_VALUE: <what the previous extraction produced for this field>\n" +
  "Emit a JSON object exactly: { \"value\": <new value>, \"_confidence\": <0..1>, \"explanation\": <short string> }\n" +
  "If you cannot find a confident value (below 0.6), emit { \"value\": null, \"_confidence\": <number>, \"explanation\": <why> }.\n" +
  "Output ONLY the JSON object, no commentary, no markdown fences.";

const GL_CODER_PROMPT =
  "You assign General-Ledger accounting codes to invoice line items. The user message will provide:\n" +
  "  - The vendor name and total amount (for context).\n" +
  "  - An array of line items, each with description, quantity, unit_price, amount.\n" +
  "Use the knowledge_base_search tool to look up similar historical line items in the vendor-history KB.\n" +
  "Emit a JSON array, one entry per input line item (in order), each:\n" +
  "  { \"line_item_index\": <0-based int>, \"gl_code\": <string e.g. '6420-Office-Supplies'>, " +
  "\"rationale\": <short string>, \"needs_cfo_review\": <bool>, \"_confidence\": <0..1> }\n" +
  "Set needs_cfo_review = true when:\n" +
  "  - line item amount > $5000, OR\n" +
  "  - vendor not seen in historical search results (new vendor), OR\n" +
  "  - line item description doesn't clearly match any historical category.\n" +
  "Output ONLY the JSON array, no commentary, no markdown fences.";

interface AgentSpec {
  name: string;
  email: string; // email of the backing auth.users row
  displayName: string;
  systemPrompt: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  tools: Array<Record<string, unknown>>;
}

const AGENT_PASSWORD = "agent-password-not-used-but-required-by-gotrue";

async function getSpecs(): Promise<AgentSpec[]> {
  // GL-coder needs the vendor-history KB id. seed-vendor-history.ts creates it
  // separately; we look it up here. If it doesn't exist yet, we provision the
  // GL-coder with NO knowledge_base_search tool and add it later (idempotent re-run).
  const { findKBByName } = await import("./seed-helpers.js");
  const vendorKB = await findKBByName("vendor-history-kb");

  return [
    {
      name: "extractor-agent",
      email: "extractor-agent@cookbook-02.local",
      displayName: "Extractor Agent",
      systemPrompt: EXTRACTOR_PROMPT,
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
      tools: [],
    },
    {
      name: "field-extractor-agent",
      email: "field-extractor-agent@cookbook-02.local",
      displayName: "Field Extractor",
      systemPrompt: FIELD_EXTRACTOR_PROMPT,
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
      tools: [],
    },
    {
      name: "gl-coder-agent",
      email: "gl-coder-agent@cookbook-02.local",
      displayName: "GL Coder",
      systemPrompt: GL_CODER_PROMPT,
      model: "gpt-5.4-mini",
      reasoningEffort: "medium",
      tools: vendorKB
        ? [{ type: "knowledge_base_search", knowledge_base_id: vendorKB.id }]
        : [],
    },
  ];
}

// Idempotently assign a KB to an agent via POST /api/agents/<id>/knowledge-bases.
// The platform exposes the KB as a knowledge_base_search tool at run time when assigned.
// Returns "assigned" | "already_assigned".
async function ensureAgentKBAssignment(
  agentId: string,
  kbId: string,
): Promise<"assigned" | "already_assigned"> {
  const res = await fetch(`${BASE_URL}/api/agents/${agentId}/knowledge-bases`, {
    method: "POST",
    headers: {
      apikey: API_KEY!,
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ knowledge_base_id: kbId }),
  });
  if (res.status === 409) return "already_assigned"; // duplicate — idempotent
  if (!res.ok) {
    throw new Error(
      `POST /api/agents/${agentId}/knowledge-bases → ${res.status}: ${await res.text()}`,
    );
  }
  return "assigned";
}

export async function provisionAgents(): Promise<void> {
  const specs = await getSpecs();
  for (const spec of specs) {
    console.log(`\n→ ${spec.name}`);

    // 1. Backing auth.users row.
    const user = await findOrCreateAgentAuthUser(spec.email, AGENT_PASSWORD);
    if (user.created) {
      console.log(`  created auth.users row (${user.id.slice(0, 8)}…)`);
    } else {
      console.log(`  ✓ auth.users row exists (${user.id.slice(0, 8)}…)`);
    }

    // 2. Profile (mark is_agent=true, set display_name).
    await ensureAgentProfile(user.id, spec.displayName);
    console.log(`  ✓ profile (display_name="${spec.displayName}", is_agent=true)`);

    // 3. The agent itself.
    let agent = await findAgentByName(spec.name);
    if (agent) {
      console.log(`  ✓ Agent ${spec.name} exists (${agent.id.slice(0, 8)}…)`);
    } else {
      agent = await api<Agent>("/api/agents", {
        method: "POST",
        body: JSON.stringify({
          name: spec.name,
          model: spec.model,
          system_prompt: spec.systemPrompt,
          settings: { reasoning_effort: spec.reasoningEffort },
        }),
      });
      console.log(`  created agent (${agent.id.slice(0, 8)}…)`);
    }

    // 4. KB tool assignment for GL-coder.
    //    The platform surfaces KB search as a tool at run time when a KB is assigned
    //    via agent_knowledge_bases. The /api/agents PATCH endpoint does not accept
    //    a tools array; KB assignment is a separate operation. Idempotent: 409 means
    //    already assigned, which is fine.
    for (const tool of spec.tools) {
      if (tool.type === "knowledge_base_search" && tool.knowledge_base_id) {
        const result = await ensureAgentKBAssignment(
          agent.id,
          tool.knowledge_base_id as string,
        );
        if (result === "assigned") {
          console.log(`    → KB assigned (vendor-history-kb)`);
        } else {
          console.log(`    → KB already assigned (vendor-history-kb)`);
        }
      }
    }
    if (spec.tools.length === 0) {
      console.log(`    → no tools to attach`);
    }
  }

  console.log("\n✓ All three agents provisioned.");
  console.log("  Note: GL-coder's KB tool depends on vendor-history-kb existing.");
  console.log("  Re-run after seed:vendor-history if you provisioned the agent first.");
}

const isDirectRun = process.argv[1]?.endsWith("seed-agents.ts");
if (isDirectRun) {
  provisionAgents().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
