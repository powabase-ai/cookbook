// Recipe 02 — Upload sample invoice PDFs to the invoices-corpus KB.
//
// Idempotent at the KB level (reuses existing KB by name) AND at the
// source level (skips already-uploaded files by filename).
//
// Run:
//   npm run upload

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

const KB_NAME = "invoices-corpus";

export async function uploadInvoices(): Promise<{ kb: KB; sourceIds: string[] }> {
  let kb = await findKBByName(KB_NAME);
  if (!kb) {
    console.log(`→ Creating KB: ${KB_NAME}`);
    kb = await api<KB>("/api/knowledge-bases", {
      method: "POST",
      body: JSON.stringify({
        name: KB_NAME,
        description: "Sample invoice PDFs for Recipe 02. Sources only — agent uses context_override.",
        indexing_config: {
          strategy: "chunk_embed",
          embedding_model: "text-embedding-3-small",
        },
      }),
    });
    console.log(`  id: ${kb.id}`);
  } else {
    console.log(`✓ KB ${KB_NAME} exists (${kb.id.slice(0, 8)}…)`);
  }

  // List sources actually indexed into THIS KB (not the global sources table).
  // /api/sources doesn't filter by knowledge_base_id — the param is silently
  // ignored — so we use the KB-scoped detail endpoint instead. We treat a
  // source as "already done" only if it's both extracted and has a completed
  // index_status; anything else (extracting/failed/missing index row) gets
  // re-attempted by the rest of the loop.
  const kbDetail = await api<{
    indexed_sources?: Array<{
      source_id: string;
      source_name: string;
      index_status?: string;
    }>;
  }>(`/api/knowledge-bases/${kb.id}`);
  const completed = new Map<string, string>(); // filename -> source_id
  for (const s of kbDetail.indexed_sources ?? []) {
    if (s.index_status === "completed" || s.index_status === "indexed") {
      completed.set(s.source_name, s.source_id);
    }
  }

  const dir = "seed-content";
  const allFiles = (await readdir(dir)).filter((f) => f.endsWith(".pdf"));
  const sourceIds: string[] = [];

  for (const file of allFiles) {
    const filePath = join(dir, file);
    if (completed.has(file)) {
      console.log(`  ✓ ${file} already uploaded (${completed.get(file)!.slice(0, 8)}…)`);
      sourceIds.push(completed.get(file)!);
      continue;
    }
    const src = await uploadSource(kb.id, filePath, "application/pdf");
    process.stdout.write(`  ${file} (${src.id.slice(0, 8)}…) extracting…`);
    await pollSourceReady(src.id);
    await addSourceToKB(kb.id, src.id);
    console.log(" ready + indexed");
    sourceIds.push(src.id);
  }

  return { kb, sourceIds };
}

const isDirectRun = process.argv[1]?.endsWith("upload-invoices.ts");
if (isDirectRun) {
  uploadInvoices()
    .then(({ sourceIds }) => {
      console.log(`\n✓ Uploaded / verified ${sourceIds.length} invoice sources.`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
