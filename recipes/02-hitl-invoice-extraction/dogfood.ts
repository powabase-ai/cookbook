// Recipe 02 — Dogfood: verify the typed-handoff chain end-to-end.
//
// Walks every items row, asserts:
//   - every approved item has gl_codes
//   - every approved item's _arithmetic_valid is true
//   - every escalated item has at least one failing gate
//   - extraction_attempts has at least the initial attempt for every item
//
// Run:
//   npm run dogfood

import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: ".env.local" });

const DATABASE_URI = process.env.DATABASE_URI!;
const CONFIDENCE_THRESHOLD = 0.85;

interface ItemRow {
  id: string;
  status: string;
  vendor: string;
  draft: {
    vendor: { _confidence: number };
    invoice_number: { _confidence: number };
    invoice_date: { _confidence: number };
    due_date: { _confidence: number };
    line_items: Array<{ _confidence: number }>;
    subtotal: { _confidence: number };
    tax: { _confidence: number };
    total: { _confidence: number; value: number };
    _arithmetic_valid: boolean;
  };
  gl_codes_count: number;
  attempts_count: number;
}

function allConfPass(d: ItemRow["draft"]): boolean {
  return (
    d.vendor._confidence >= CONFIDENCE_THRESHOLD &&
    d.invoice_number._confidence >= CONFIDENCE_THRESHOLD &&
    d.invoice_date._confidence >= CONFIDENCE_THRESHOLD &&
    d.due_date._confidence >= CONFIDENCE_THRESHOLD &&
    d.subtotal._confidence >= CONFIDENCE_THRESHOLD &&
    d.tax._confidence >= CONFIDENCE_THRESHOLD &&
    d.total._confidence >= CONFIDENCE_THRESHOLD &&
    d.line_items.every((li) => li._confidence >= CONFIDENCE_THRESHOLD)
  );
}

async function main() {
  const pg = new Client({ connectionString: DATABASE_URI });
  await pg.connect();
  let failures = 0;
  try {
    const { rows } = await pg.query<ItemRow>(`
      select i.id, i.status,
             i.draft_extraction->'vendor'->>'name' as vendor,
             i.draft_extraction as draft,
             (select count(*) from public.gl_codes g where g.item_id = i.id)::int as gl_codes_count,
             (select count(*) from public.extraction_attempts a where a.item_id = i.id)::int as attempts_count
      from public.items i
      order by i.created_at;
    `);

    console.log(`Checking ${rows.length} items…\n`);
    for (const r of rows) {
      const conf = allConfPass(r.draft);
      const arith = r.draft._arithmetic_valid;
      console.log(
        `  ${r.vendor.padEnd(40)} status=${r.status.padEnd(11)} ` +
          `conf=${conf ? "✓" : "✗"} arith=${arith ? "✓" : "✗"} ` +
          `gl_codes=${r.gl_codes_count} attempts=${r.attempts_count}`,
      );

      if (r.status === "approved") {
        if (r.gl_codes_count === 0) {
          console.log(`    ✗ approved but gl_codes is empty`);
          failures++;
        }
        if (!arith) {
          console.log(`    ✗ approved but arithmetic_valid is false`);
          failures++;
        }
      }
      if (r.status === "escalated") {
        if (conf && arith) {
          console.log(`    ✗ escalated despite conf=✓ and arith=✓ — gate logic bug?`);
          failures++;
        }
      }
      if (r.attempts_count === 0) {
        console.log(`    ✗ no extraction_attempts row (initial attempt missing)`);
        failures++;
      }
    }
    console.log(
      `\n${failures === 0 ? "✓ all assertions pass" : `✗ ${failures} failure(s)`}`,
    );
    process.exit(failures === 0 ? 0 : 1);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
