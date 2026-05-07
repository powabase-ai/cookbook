// Recipe 02 — Provision the vendor-history knowledge base.
//
// Idempotent: if vendor-history-kb already exists, reuse it; uploads only happen
// the first time the KB is created.
//
// Run:
//   npm run seed:vendor-history

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  addSourceToKB,
  api,
  findKBByName,
  pollSourceReady,
  uploadSource,
  type KB,
} from "./seed-helpers.js";

const KB_NAME = "vendor-history-kb";
const KB_DESCRIPTION =
  "Historical invoice line items and the GL codes they were assigned. Used by " +
  "the GL-coder agent to look up similar prior items.";

export async function provisionVendorHistory(): Promise<KB> {
  let kb = await findKBByName(KB_NAME);
  if (kb) {
    console.log(`✓ KB ${KB_NAME} exists (${kb.id.slice(0, 8)}…) — skipping create + upload`);
    return kb;
  }

  console.log(`→ Creating KB: ${KB_NAME}`);
  kb = await api<KB>("/api/knowledge-bases", {
    method: "POST",
    body: JSON.stringify({
      name: KB_NAME,
      description: KB_DESCRIPTION,
      indexing_config: {
        strategy: "chunk_embed",
        embedding_model: "text-embedding-3-small",
      },
    }),
  });
  console.log(`  id: ${kb.id}`);

  console.log(`→ Uploading historical invoice corpus`);
  const dir = "seed-content/vendor-history";
  for (const file of await readdir(dir)) {
    const filePath = join(dir, file);
    const src = await uploadSource(kb.id, filePath, "text/markdown");
    process.stdout.write(`  ${file} (${src.id.slice(0, 8)}…) extracting…`);
    await pollSourceReady(src.id);
    console.log(" ready");
    await addSourceToKB(kb.id, src.id);
    console.log(`  ${file} → indexed into KB`);
  }

  return kb;
}

const isDirectRun = process.argv[1]?.endsWith("seed-vendor-history.ts");
if (isDirectRun) {
  provisionVendorHistory().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
