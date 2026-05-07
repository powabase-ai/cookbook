import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Props {
  itemId: string;
  fieldPath: string;
}

interface Attempt {
  attempt_number: number;
  target_field: string | null;
  hint: string | null;
  extraction: Record<string, unknown>;
  created_at: string;
}

// Path walker that handles both dotted (vendor.name, invoice_number) and
// indexed (line_items[2].description) paths. Mirrors the shape of
// readFieldValue in lib/field-paths.ts but operates on a raw jsonb snapshot.
function getFieldValue(extraction: Record<string, unknown>, path: string): string {
  const tokens = path.match(/[^.[\]]+/g) ?? [];
  let cur: unknown = extraction;
  for (const tok of tokens) {
    if (cur == null) return "—";
    if (Array.isArray(cur)) {
      const idx = Number(tok);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[tok];
    } else {
      return "—";
    }
  }
  if (cur && typeof cur === "object" && "value" in cur) {
    return String((cur as { value: unknown }).value);
  }
  return cur == null ? "—" : String(cur);
}

export default function HistoryTooltip({ itemId, fieldPath }: Props) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("extraction_attempts")
        .select("attempt_number, target_field, hint, extraction, created_at")
        .eq("item_id", itemId)
        .order("attempt_number", { ascending: false });
      setAttempts((data ?? []) as Attempt[]);
    })();
  }, [itemId]);

  if (attempts.length <= 1) return null;
  const previous = attempts[1]; // attempt[0] is current; attempt[1] is the one before
  const previousValue = getFieldValue(previous.extraction, fieldPath);

  return (
    <span className="text-xs text-gray-500 ml-2" title={`previous: ${previousValue}`}>
      (was: {previousValue.length > 30 ? previousValue.slice(0, 30) + "…" : previousValue})
    </span>
  );
}
