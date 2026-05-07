// Recipe 01 — Seed (all-in-one)
//
// Convenience wrapper that runs the three teaching steps in sequence with
// no chat probes — useful when you want the resources provisioned but
// don't want to read each step's narrative output.
//
// For the teaching path that walks each concept (one agent → three
// independent agents → orchestration), follow `## Build it` in README.md
// and run the steps individually:
//   npm run step:1   # billing KB + agent, chat with it directly
//   npm run step:2   # add technical + product specialists
//   npm run step:3   # wrap them in a Supervisor orchestration
//
// All three are idempotent — safe to re-run.
//
// Run:
//   npm install
//   npm run seed

import { provisionBilling } from "./step1-billing.js";
import { provisionSpecialists } from "./step2-add-specialists.js";
import { provisionOrchestration } from "./step3-orchestration.js";

async function main() {
  console.log("=== Step 1: billing specialist ===");
  await provisionBilling();

  console.log("\n=== Step 2: technical + product specialists ===");
  await provisionSpecialists();

  console.log("\n=== Step 3: Supervisor orchestration ===");
  const orch = await provisionOrchestration();

  console.log(`\n✓ Seed complete\n`);
  console.log(`Paste this into code/.env.local:`);
  console.log(`VITE_POWABASE_ORCHESTRATION_ID=${orch.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
