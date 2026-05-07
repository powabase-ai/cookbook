import type { InvoiceDraft } from "../types/invoice";

// Closed enum of supported target_field paths (per spec).
export const SUPPORTED_FIELDS = [
  "vendor.name",
  "vendor.address",
  "invoice_number",
  "invoice_date",
  "due_date",
  "subtotal",
  "tax",
  "total",
] as const;

// Friendly labels keyed by field path for the per-field "Ask agent" button.
// (Plus indexed line-item paths get labels via fieldLabel() at runtime.)
export const FIELD_LABELS: Record<string, string> = {
  "vendor.name": "Vendor name",
  "vendor.address": "Vendor address",
  invoice_number: "Invoice number",
  invoice_date: "Invoice date",
  due_date: "Due date",
  subtotal: "Subtotal",
  tax: "Tax",
  total: "Total",
};

export type FieldName =
  | (typeof SUPPORTED_FIELDS)[number]
  | `line_items[${number}].description`
  | `line_items[${number}].quantity`
  | `line_items[${number}].unit_price`
  | `line_items[${number}].amount`;

const LINE_ITEM_RE = /^line_items\[(\d+)\]\.(description|quantity|unit_price|amount)$/;

export function isValidFieldPath(path: string, draft: InvoiceDraft): boolean {
  if ((SUPPORTED_FIELDS as readonly string[]).includes(path)) return true;
  const m = LINE_ITEM_RE.exec(path);
  if (!m) return false;
  const idx = Number(m[1]);
  return idx >= 0 && idx < draft.line_items.length;
}

// Coerce an arbitrary value into a finite number. Tolerates strings with
// currency symbols, thousands separators, and whitespace (the LLM regularly
// returns "€1,209.60" even when the prompt asks for a raw number). Throws
// with a descriptive message on uncoercible input — callers (form onBlur,
// agent re-extraction) catch and surface the failure.
function coerceNumeric(v: unknown): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`expected a finite number, got ${v}`);
    return v;
  }
  if (typeof v === "string") {
    const cleaned = v.replace(/[$€£¥₹\s,]/g, "");
    const n = Number(cleaned);
    if (!Number.isFinite(n)) throw new Error(`couldn't parse "${v}" as a number`);
    return n;
  }
  throw new Error(`expected number or numeric string, got ${typeof v}`);
}

// Apply a single-field patch returned by the field-extractor: { value, _confidence }.
export function applyFieldPatch(
  draft: InvoiceDraft,
  path: string,
  newValue: unknown,
  newConfidence: number,
): InvoiceDraft {
  const next = JSON.parse(JSON.stringify(draft)) as InvoiceDraft;
  if (path === "vendor.name") {
    next.vendor.name = String(newValue);
    next.vendor._confidence = newConfidence;
    return next;
  }
  if (path === "vendor.address") {
    next.vendor.address = newValue == null ? null : String(newValue);
    next.vendor._confidence = newConfidence;
    return next;
  }
  const simple = ["invoice_number", "invoice_date", "due_date"] as const;
  if ((simple as readonly string[]).includes(path)) {
    const key = path as (typeof simple)[number];
    next[key] = { value: String(newValue), _confidence: newConfidence };
    return next;
  }
  const numeric = ["subtotal", "tax", "total"] as const;
  if ((numeric as readonly string[]).includes(path)) {
    const key = path as (typeof numeric)[number];
    next[key] = { value: coerceNumeric(newValue), _confidence: newConfidence };
    return next;
  }
  const m = LINE_ITEM_RE.exec(path);
  if (m) {
    const idx = Number(m[1]);
    const field = m[2] as "description" | "quantity" | "unit_price" | "amount";
    const li = next.line_items[idx];
    if (!li) throw new Error(`line_items[${idx}] not found`);
    if (field === "description") li.description = String(newValue);
    if (field === "quantity") li.quantity = newValue == null ? null : coerceNumeric(newValue);
    if (field === "unit_price") li.unit_price = newValue == null ? null : coerceNumeric(newValue);
    if (field === "amount") li.amount = coerceNumeric(newValue);
    li._confidence = newConfidence;
    return next;
  }
  throw new Error(`Unsupported field path: ${path}`);
}

// Friendly label for the field path dropdown.
export function fieldLabel(path: string): string {
  if (path in FIELD_LABELS) return FIELD_LABELS[path];
  const m = LINE_ITEM_RE.exec(path);
  if (m) return `Line item ${m[1]}: ${m[2].replace("_", " ")}`;
  return path;
}

// Read the current value at a field path. Used when constructing the
// CURRENT_VALUE clause of the field-extractor's user message. Lives here
// (alongside applyFieldPatch) so adding a new field touches one module.
export function readFieldValue(draft: InvoiceDraft, path: string): unknown {
  if (path === "vendor.name") return draft.vendor.name;
  if (path === "vendor.address") return draft.vendor.address;
  if (["invoice_number", "invoice_date", "due_date"].includes(path)) {
    return (draft as unknown as Record<string, { value: unknown }>)[path].value;
  }
  if (["subtotal", "tax", "total"].includes(path)) {
    return (draft as unknown as Record<string, { value: unknown }>)[path].value;
  }
  const m = LINE_ITEM_RE.exec(path);
  if (m) {
    const idx = Number(m[1]);
    const field = m[2] as "description" | "quantity" | "unit_price" | "amount";
    const li = draft.line_items[idx];
    return li ? li[field] : undefined;
  }
  return undefined;
}
