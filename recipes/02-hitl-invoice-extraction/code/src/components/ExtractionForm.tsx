import { useEffect, useRef, useState } from "react";
import type { QueueItem } from "../types/invoice";
import HistoryTooltip from "./HistoryTooltip";

interface Props {
  item: QueueItem;
  onApprove: () => void;
  onReject: () => void;
  onPatchField: (path: string, newValue: unknown) => Promise<void>;
  onAskAgent: (fieldPath: string, hint: string) => Promise<void>;
  reExtractionReady: boolean;
}

function ConfPill({ value }: { value: number }) {
  const tone =
    value >= 0.85 ? "bg-green-100 text-green-800"
    : value >= 0.7 ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${tone}`}>
      {value.toFixed(2)}
    </span>
  );
}

// Controlled input that syncs from `value` only when the user isn't focused.
// This lets peer edits and agent re-extractions land in the input live —
// without clobbering an active typing session.
function SmartInput({
  value,
  onCommit,
  numeric = false,
  step,
  className,
}: {
  value: string | number;
  onCommit: (newValue: string | number) => void | Promise<void>;
  numeric?: boolean;
  step?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    // Sync from prop only when the user isn't focused — keeps peer/agent
    // updates landing live in the input without clobbering active typing.
    if (!focused.current) setLocal(String(value));
  }, [value]);

  return (
    <input
      type={numeric ? "number" : "text"}
      step={step}
      value={local}
      className={className}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e) => {
        focused.current = false;
        onCommit(numeric ? Number(e.target.value) : e.target.value);
      }}
    />
  );
}

export default function ExtractionForm({
  item,
  onApprove,
  onReject,
  onPatchField,
  onAskAgent,
  reExtractionReady,
}: Props) {
  const draft = item.draft_extraction!;
  const [submitting, setSubmitting] = useState(false);

  async function handleApprove() {
    setSubmitting(true);
    try {
      await onApprove();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold">Extracted invoice</h2>
        <div className="space-x-2">
          <button
            onClick={onReject}
            disabled={submitting}
            className="px-3 py-1 text-sm border rounded text-red-700"
          >
            Reject
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="px-3 py-1 text-sm bg-green-600 text-white rounded disabled:opacity-50"
          >
            {submitting ? "Approving…" : "Approve"}
          </button>
        </div>
      </header>

      <div className="text-xs text-gray-500">
        Arithmetic: {draft._arithmetic_valid ? "valid ✓" : "MISMATCH ✗"}
      </div>

      <FieldRow label="Vendor name" path="vendor.name" itemId={item.id}
                value={draft.vendor.name} confidence={draft.vendor._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} />
      <FieldRow label="Vendor address" path="vendor.address" itemId={item.id}
                value={draft.vendor.address ?? ""} confidence={draft.vendor._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} />
      <FieldRow label="Invoice number" path="invoice_number" itemId={item.id}
                value={draft.invoice_number.value} confidence={draft.invoice_number._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} />
      <FieldRow label="Invoice date" path="invoice_date" itemId={item.id}
                value={draft.invoice_date.value} confidence={draft.invoice_date._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} />
      <FieldRow label="Due date" path="due_date" itemId={item.id}
                value={draft.due_date.value} confidence={draft.due_date._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} />

      <div>
        <h3 className="font-semibold text-sm mb-2">Line items</h3>
        <div className="space-y-2">
          {draft.line_items.map((li, i) => (
            <div key={i} className="border rounded p-2 grid grid-cols-12 gap-2 text-sm">
              <SmartInput
                className="col-span-7 border rounded px-1"
                value={li.description}
                onCommit={(v) => onPatchField(`line_items[${i}].description`, v)}
              />
              <SmartInput
                className="col-span-1 border rounded px-1 text-right"
                numeric
                value={li.quantity ?? 0}
                onCommit={(v) => onPatchField(`line_items[${i}].quantity`, v)}
              />
              <SmartInput
                className="col-span-2 border rounded px-1 text-right"
                numeric
                step="0.01"
                value={li.unit_price ?? 0}
                onCommit={(v) => onPatchField(`line_items[${i}].unit_price`, v)}
              />
              <SmartInput
                className="col-span-2 border rounded px-1 text-right"
                numeric
                step="0.01"
                value={li.amount}
                onCommit={(v) => onPatchField(`line_items[${i}].amount`, v)}
              />
              <div className="col-span-12 text-xs text-gray-500 flex items-center gap-2">
                <ConfPill value={li._confidence} />
                <HistoryTooltip itemId={item.id} fieldPath={`line_items[${i}].description`} />
                <AskAgentControl
                  fieldPath={`line_items[${i}].amount`}
                  ready={reExtractionReady}
                  onAsk={(hint) => onAskAgent(`line_items[${i}].amount`, hint)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <FieldRow label="Subtotal" path="subtotal" itemId={item.id}
                value={String(draft.subtotal.value)} confidence={draft.subtotal._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} numeric />
      <FieldRow label="Tax" path="tax" itemId={item.id}
                value={String(draft.tax.value)} confidence={draft.tax._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} numeric />
      <FieldRow label="Total" path="total" itemId={item.id}
                value={String(draft.total.value)} confidence={draft.total._confidence}
                onPatch={onPatchField} onAskAgent={onAskAgent}
                reExtractionReady={reExtractionReady} numeric />
    </div>
  );
}

function AskAgentControl({
  fieldPath,
  ready,
  onAsk,
}: {
  fieldPath: string;
  ready: boolean;
  onAsk: (hint: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) {
    return (
      <span className="text-xs text-gray-400" title="Agent not yet loaded">
        loading…
      </span>
    );
  }
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-1.5 py-0.5 rounded border border-purple-300 text-purple-700 hover:bg-purple-50"
      >
        Ask agent
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder={`Hint for ${fieldPath}…`}
        className="text-xs border rounded px-1 py-0.5 w-72"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setHint("");
          }
        }}
      />
      <button
        type="button"
        disabled={busy || !hint.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            await onAsk(hint.trim());
            setOpen(false);
            setHint("");
          } finally {
            setBusy(false);
          }
        }}
        className="text-xs px-1.5 py-0.5 bg-purple-600 text-white rounded disabled:opacity-50"
      >
        {busy ? "…" : "Send"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setHint("");
        }}
        className="text-xs text-gray-500"
      >
        ✕
      </button>
    </span>
  );
}

function FieldRow({
  label,
  path,
  itemId,
  value,
  confidence,
  onPatch,
  onAskAgent,
  reExtractionReady,
  numeric,
}: {
  label: string;
  path: string;
  itemId: string;
  value: string;
  confidence: number;
  onPatch: (path: string, newValue: unknown) => Promise<void>;
  onAskAgent: (fieldPath: string, hint: string) => Promise<void>;
  reExtractionReady: boolean;
  numeric?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium flex items-center justify-between">
        <span>{label}</span>
        <span className="flex items-center gap-1">
          <ConfPill value={confidence} />
          <HistoryTooltip itemId={itemId} fieldPath={path} />
          <AskAgentControl
            fieldPath={path}
            ready={reExtractionReady}
            onAsk={(hint) => onAskAgent(path, hint)}
          />
        </span>
      </label>
      <SmartInput
        className="w-full border rounded p-1 text-sm"
        numeric={numeric}
        step={numeric ? "0.01" : undefined}
        value={value}
        onCommit={(v) => onPatch(path, v)}
      />
    </div>
  );
}
