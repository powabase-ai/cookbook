import { useEffect } from "react";
import { supabase } from "../lib/supabase";

// Subscribes to Postgres Changes on a single item row + its extraction_attempts
// + its gl_codes. Caller refetches on each event.
export function useItemRealtime(
  itemId: string,
  onChange: () => void,
): void {
  useEffect(() => {
    if (!itemId) return;
    const channel = supabase
      .channel(`item-${itemId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items", filter: `id=eq.${itemId}` },
        () => onChange(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "extraction_attempts",
          filter: `item_id=eq.${itemId}`,
        },
        () => onChange(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gl_codes",
          filter: `item_id=eq.${itemId}`,
        },
        () => onChange(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onChange();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId, onChange]);
}
