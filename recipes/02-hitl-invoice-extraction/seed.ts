// Recipe 02 — Convenience wrapper: runs all the seed scripts in sequence.
//
// Use when you want to provision everything end-to-end from a fresh project.
// Schema + policies must already be applied via psql; this script handles the
// API-side resources only.
//
// Run:
//   npm run seed

import { provisionAgents } from "./seed-agents.js";
import { provisionVendorHistory } from "./seed-vendor-history.js";
import { uploadInvoices } from "./upload-invoices.js";

async function main() {
  console.log("=== Step 1: vendor-history KB ===");
  await provisionVendorHistory();

  console.log("\n=== Step 2: agents (extractor, field-extractor, gl-coder) ===");
  await provisionAgents();

  console.log("\n=== Step 3: upload sample invoices ===");
  await uploadInvoices();

  console.log("\n✓ Seed complete.");
  console.log("  Next: run `npm run trigger:extractions` to process the uploaded invoices.");
  console.log("  Or:   run `npm run trigger:extractions -- --watch` for the live-demo phase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
