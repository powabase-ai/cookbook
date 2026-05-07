// Recipe 02 — Probe the field-extractor agent.
//
// Manually invokes the field-extractor on the smudged-invoice item with a
// hint, prints the result, and (in --apply mode) patches items.draft_extraction
// + appends extraction_attempts.
//
// Run:
//   npm run probe:field-extract               # dry-run, prints result
//   npm run probe:field-extract -- --apply    # writes the patch

import { Client } from "pg";
import {
  findAgentByName,
  getSourcePageTexts,
  pageTextsToContext,
  runAgent,
} from "./seed-helpers.js";

const DATABASE_URI = process.env.DATABASE_URI!;

const TARGET_ITEM_VENDOR = "Coastal Office Furnishings";
const TARGET_FIELD = "invoice_number";
const HINT =
  "the canonical invoice number is in the top-right of page 2 (format INV-YYYY-####); " +
  "page 1 only has a customer reference number that should be ignored.";

interface FieldExtractorResult {
  value: string | null;
  _confidence: number;
  explanation: string;
}

function stripJsonFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pg = new Client({ connectionString: DATABASE_URI });
  await pg.connect();
  try {
    // Find the smudged-invoice item.
    const { rows: itemRows } = await pg.query<{
      id: string;
      source_id: string;
      draft: Record<string, unknown>;
    }>(
      `select id, source_id, draft_extraction as draft
       from public.items
       where draft_extraction->'vendor'->>'name' = $1
       limit 1`,
      [TARGET_ITEM_VENDOR],
    );
    if (itemRows.length === 0) {
      throw new Error(
        `No item found for vendor "${TARGET_ITEM_VENDOR}". Run seed first.`,
      );
    }
    const item = itemRows[0];
    const currentValue =
      (item.draft as { invoice_number?: { value?: string } }).invoice_number?.value ?? "(none)";
    console.log(`Item: ${item.id.slice(0, 8)}…`);
    console.log(`Current ${TARGET_FIELD}: ${currentValue}`);

    const fieldExtractor = await findAgentByName("field-extractor-agent");
    if (!fieldExtractor) {
      throw new Error("field-extractor-agent not found — run seed:agents.");
    }

    const pages = await getSourcePageTexts(item.source_id);
    const userMsg =
      `TARGET_FIELD: ${TARGET_FIELD}\n` +
      `HINT: ${HINT}\n` +
      `CURRENT_VALUE: ${currentValue}`;

    const raw = await runAgent(fieldExtractor.id, userMsg, {
      context_override: pageTextsToContext(pages),
    });
    const parsed = JSON.parse(stripJsonFences(raw)) as FieldExtractorResult;
    console.log("\n--- Field-extractor response ---");
    console.log(JSON.stringify(parsed, null, 2));

    if (!apply) {
      console.log("\n(dry-run; pass --apply to write the patch)");
      return;
    }

    if (parsed.value === null) {
      console.log("\nAgent declined to commit a value; nothing to patch.");
      return;
    }

    const fieldExtractorProfileId = (await pg.query<{ id: string }>(
      `select id from public.profiles where display_name = 'Field Extractor' and is_agent = true`,
    )).rows[0]?.id;
    if (!fieldExtractorProfileId) {
      throw new Error("Field Extractor profile not found.");
    }

    // Patch just the target field on draft_extraction.
    await pg.query("BEGIN");
    await pg.query(
      `update public.items
       set draft_extraction = jsonb_set(
         draft_extraction,
         $2,
         jsonb_build_object('value', $3::text, '_confidence', $4::numeric),
         true
       )
       where id = $1`,
      [
        item.id,
        `{${TARGET_FIELD}}`,
        parsed.value,
        parsed._confidence,
      ],
    );
    await pg.query(
      `insert into public.extraction_attempts (item_id, target_field, hint, extraction, attempted_by)
       values ($1, $2, $3,
               (select draft_extraction from public.items where id = $1),
               $4)`,
      [item.id, TARGET_FIELD, HINT, fieldExtractorProfileId],
    );
    await pg.query("COMMIT");
    console.log("\n✓ Patched. New extraction_attempts row appended.");
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
