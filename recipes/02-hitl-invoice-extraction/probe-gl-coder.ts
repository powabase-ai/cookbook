// Recipe 02 — Probe the GL-coder agent.
//
// Picks one item, manually flips it to 'approved', runs the GL-coder over its
// line items, inserts the resulting gl_codes rows. CLI test of the downstream
// agent before we wire the React Approve button.
//
// Run:
//   npm run probe:gl-coder           # processes the first escalated item
//   npm run probe:gl-coder -- --vendor "Acme Office Supplies LLC"   # specific item

import { Client } from "pg";
import { findAgentByName, runAgent } from "./seed-helpers.js";

const DATABASE_URI = process.env.DATABASE_URI!;

interface GLCoderEntry {
  line_item_index: number;
  gl_code: string;
  rationale: string;
  needs_cfo_review: boolean;
  _confidence: number;
}

interface InvoiceDraft {
  vendor: { name: string };
  total: { value: number };
  line_items: Array<{
    description: string;
    quantity?: number;
    unit_price?: number;
    amount: number;
  }>;
}

function stripJsonFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function getVendorArg(): string | null {
  const idx = process.argv.indexOf("--vendor");
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

async function main() {
  const vendor = getVendorArg();
  const pg = new Client({ connectionString: DATABASE_URI });
  await pg.connect();
  try {
    const { rows: items } = vendor
      ? await pg.query<{ id: string; draft: InvoiceDraft }>(
          `select id, draft_extraction as draft from public.items
           where draft_extraction->'vendor'->>'name' = $1
           limit 1`,
          [vendor],
        )
      : await pg.query<{ id: string; draft: InvoiceDraft }>(
          `select id, draft_extraction as draft from public.items
           where status = 'escalated'
           order by created_at limit 1`,
        );

    if (items.length === 0) {
      throw new Error("No matching item.");
    }
    const item = items[0];
    const draft = item.draft;
    console.log(`Item ${item.id.slice(0, 8)}…  vendor=${draft.vendor.name}  total=${draft.total.value}`);

    // Flip status to 'approved' first (mirrors what the React Approve handler does).
    await pg.query(
      `update public.items set status='approved', decided_at=now() where id=$1`,
      [item.id],
    );

    const glCoder = await findAgentByName("gl-coder-agent");
    if (!glCoder) throw new Error("gl-coder-agent not found.");

    const userMsg = JSON.stringify({
      vendor_name: draft.vendor.name,
      total: draft.total.value,
      line_items: draft.line_items.map((li, i) => ({ index: i, ...li })),
    });

    const raw = await runAgent(glCoder.id, userMsg);
    const codes = JSON.parse(stripJsonFences(raw)) as GLCoderEntry[];
    console.log(`\nGL-coder produced ${codes.length} entries.`);

    for (const entry of codes) {
      await pg.query(
        `insert into public.gl_codes (item_id, line_item_index, gl_code, rationale, needs_cfo_review, confidence)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (item_id, line_item_index) do update
         set gl_code = excluded.gl_code,
             rationale = excluded.rationale,
             needs_cfo_review = excluded.needs_cfo_review,
             confidence = excluded.confidence`,
        [
          item.id,
          entry.line_item_index,
          entry.gl_code,
          entry.rationale,
          entry.needs_cfo_review,
          entry._confidence,
        ],
      );
      console.log(
        `  [${entry.line_item_index}] ${entry.gl_code} ` +
          `(cfo=${entry.needs_cfo_review}, conf=${entry._confidence})  ${entry.rationale}`,
      );
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
