// Recipe 02 — trigger:extractions
//
// Polls ai.sources for rows whose extraction_status='extracted' and which
// don't yet have a corresponding public.items row, runs the extractor agent
// against each, and inserts the result. One-shot mode by default; --watch
// runs an indefinite poll loop with the configured interval.
//
// Run:
//   npm run trigger:extractions          # one-shot
//   npm run trigger:extractions -- --watch    # poll forever, 5s interval

import { Client } from "pg";
import {
  findAgentByName,
  getSourcePageTexts,
  pageTextsToContext,
  runAgent,
} from "./seed-helpers.js";

const DATABASE_URI = process.env.DATABASE_URI;
if (!DATABASE_URI) {
  throw new Error("DATABASE_URI not set in .env.local");
}

interface ExtractedInvoice {
  vendor: { name: string; address?: string; _confidence: number };
  invoice_number: { value: string; _confidence: number };
  invoice_date: { value: string; _confidence: number };
  due_date: { value: string; _confidence: number };
  line_items: Array<{
    description: string;
    quantity?: number;
    unit_price?: number;
    amount: number;
    _confidence: number;
  }>;
  subtotal: { value: number; _confidence: number };
  tax: { value: number; _confidence: number };
  total: { value: number; _confidence: number };
  // _arithmetic_valid is set by the DB trigger, not by the agent.
}

const CONFIDENCE_THRESHOLD = 0.85;

function allConfidencesPass(extraction: ExtractedInvoice): boolean {
  if (extraction.vendor._confidence < CONFIDENCE_THRESHOLD) return false;
  if (extraction.invoice_number._confidence < CONFIDENCE_THRESHOLD) return false;
  if (extraction.invoice_date._confidence < CONFIDENCE_THRESHOLD) return false;
  if (extraction.due_date._confidence < CONFIDENCE_THRESHOLD) return false;
  if (extraction.subtotal._confidence < CONFIDENCE_THRESHOLD) return false;
  if (extraction.tax._confidence < CONFIDENCE_THRESHOLD) return false;
  if (extraction.total._confidence < CONFIDENCE_THRESHOLD) return false;
  return extraction.line_items.every(
    (li) => li._confidence >= CONFIDENCE_THRESHOLD,
  );
}

function requiredFieldsPresent(extraction: ExtractedInvoice): boolean {
  return (
    !!extraction.vendor.name?.trim() &&
    !!extraction.invoice_number.value?.trim() &&
    extraction.line_items.length > 0 &&
    Number.isFinite(extraction.total.value)
  );
}

function stripJsonFences(s: string): string {
  // Be lenient — model sometimes wraps JSON in ```json ... ```. Strip if present.
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function findUnprocessedSources(pg: Client): Promise<{ id: string; name: string }[]> {
  // Sources from the invoices-corpus KB that are 'extracted' and don't have an
  // items row yet.
  const { rows } = await pg.query(`
    select distinct s.id, s.name
    from ai.sources s
    join ai.indexed_sources i on i.source_id = s.id
    join ai.knowledge_bases kb on kb.id = i.knowledge_base_id
    where kb.name = 'invoices-corpus'
      and s.extraction_status = 'extracted'
      and not exists (select 1 from public.items it where it.source_id = s.id)
    order by s.name;
  `);
  return rows;
}

async function processOne(pg: Client, source: { id: string; name: string }): Promise<void> {
  console.log(`\n→ ${source.name} (${source.id.slice(0, 8)}…)`);

  const extractor = await findAgentByName("extractor-agent");
  if (!extractor) throw new Error("extractor-agent not found — run seed:agents first.");

  const pages = await getSourcePageTexts(source.id);
  if (pages.length === 0) {
    console.log(`  ⚠ no pages — marking extraction_failed`);
    await pg.query(
      `insert into public.items (source_id, status, extraction_error)
       values ($1, 'extraction_failed', 'no page text available')`,
      [source.id],
    );
    return;
  }

  let raw: string;
  try {
    raw = await runAgent(extractor.id, "Extract this invoice.", {
      context_override: pageTextsToContext(pages),
    });
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.log(`  ⚠ agent error: ${msg}`);
    await pg.query(
      `insert into public.items (source_id, status, extraction_error)
       values ($1, 'extraction_failed', $2)`,
      [source.id, msg],
    );
    return;
  }

  let parsed: ExtractedInvoice;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch (err) {
    const msg = `JSON parse failed: ${(err as Error).message}; raw=${raw.slice(0, 200)}`;
    console.log(`  ⚠ ${msg}`);
    await pg.query(
      `insert into public.items (source_id, status, extraction_error)
       values ($1, 'extraction_failed', $2)`,
      [source.id, msg],
    );
    return;
  }

  // Insert the row first; the DB trigger computes _arithmetic_valid for us.
  // Default status = 'escalated' until the gates pass.
  const inserted = await pg.query<{ id: string; arithmetic_valid: boolean }>(
    `insert into public.items (source_id, status, draft_extraction)
     values ($1, 'escalated', $2::jsonb)
     returning id, (draft_extraction->'_arithmetic_valid')::text::boolean as arithmetic_valid`,
    [source.id, JSON.stringify(parsed)],
  );
  const itemId = inserted.rows[0].id;
  const arithmeticValid = inserted.rows[0].arithmetic_valid;

  // Decide auto-approval.
  const confOK = allConfidencesPass(parsed);
  const requiredOK = requiredFieldsPresent(parsed);

  console.log(`  inserted item ${itemId.slice(0, 8)}… `
    + `confidence=${confOK ? "✓" : "✗"} arithmetic=${arithmeticValid ? "✓" : "✗"} required=${requiredOK ? "✓" : "✗"}`);

  // Auto-approval gates: confidence threshold, arithmetic, required fields.
  if (confOK && arithmeticValid && requiredOK) {
    console.log(`  → all gates pass; auto-approving + invoking GL-coder`);
    await pg.query(
      `update public.items set status='approved', decided_at=now() where id=$1`,
      [itemId],
    );
    try {
      await runGLCoder(pg, itemId, parsed);
    } catch (err) {
      console.log(`  ⚠ GL-coder failed: ${(err as Error).message}`);
      // Item stays approved; gl_codes simply aren't populated. A retry would
      // address this in production (see spec non-goals).
    }
  } else {
    console.log(`  → escalated`);
  }

  // Record initial extraction attempt.
  const extractorAuthUserId = (await pg.query<{ id: string }>(
    `select id from public.profiles where display_name = 'Extractor Agent' and is_agent = true`,
  )).rows[0]?.id;
  if (extractorAuthUserId) {
    await pg.query(
      `insert into public.extraction_attempts (item_id, target_field, hint, extraction, attempted_by)
       values ($1, null, null, $2::jsonb, $3)`,
      [itemId, JSON.stringify(parsed), extractorAuthUserId],
    );
  }
}

async function runOnce(): Promise<number> {
  const pg = new Client({ connectionString: DATABASE_URI });
  await pg.connect();
  try {
    const sources = await findUnprocessedSources(pg);
    if (sources.length === 0) {
      console.log("Nothing to do — no unprocessed sources.");
      return 0;
    }
    console.log(`Found ${sources.length} unprocessed source(s).`);
    for (const s of sources) {
      await processOne(pg, s);
    }
    return sources.length;
  } finally {
    await pg.end();
  }
}

async function main() {
  const watch = process.argv.includes("--watch");
  if (!watch) {
    await runOnce();
    return;
  }
  console.log("Watch mode (5s poll). Ctrl+C to stop.");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error("Error in poll iteration:", err);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function runGLCoder(
  pg: Client,
  itemId: string,
  draft: ExtractedInvoice,
): Promise<void> {
  const glCoder = await findAgentByName("gl-coder-agent");
  if (!glCoder) throw new Error("gl-coder-agent not found");

  const userMsg = JSON.stringify({
    vendor_name: draft.vendor.name,
    total: draft.total.value,
    line_items: draft.line_items.map((li, i) => ({ index: i, ...li })),
  });
  const raw = await runAgent(glCoder.id, userMsg);
  // The GL-coder may emit RAG tool-call artifacts before the JSON array
  // (e.g. "to=knowledge_base_search{...}[...]"). Extract just the JSON array.
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`GL-coder response contains no JSON array; raw=${raw.slice(0, 200)}`);
  }
  const codes = JSON.parse(raw.slice(arrayStart, arrayEnd + 1)) as Array<{
    line_item_index: number;
    gl_code: string;
    rationale: string;
    needs_cfo_review: boolean;
    _confidence: number;
  }>;
  for (const entry of codes) {
    await pg.query(
      `insert into public.gl_codes (item_id, line_item_index, gl_code, rationale, needs_cfo_review, confidence)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (item_id, line_item_index) do nothing`,
      [
        itemId,
        entry.line_item_index,
        entry.gl_code,
        entry.rationale,
        entry.needs_cfo_review,
        entry._confidence,
      ],
    );
  }
}

const isDirectRun = process.argv[1]?.endsWith("trigger-extractions.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
