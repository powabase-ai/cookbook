import { useEffect } from "react";
import { supabase } from "../lib/supabase";

// Subscribes to Postgres Changes on public.items and calls onChange() on every
// INSERT / UPDATE / DELETE. Caller is expected to refetch the list on each
// event — coarse but simple, and right for recipe scope.
//
// On reconnect (transient WS drop), the SUBSCRIBED status fires again; we
// also call onChange() then so any updates that happened during the gap are
// caught by the caller's refetch.
export function useQueueRealtime(onChange: () => void): void {
  useEffect(() => {
    const channel = supabase
      .channel("queue-items")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        () => onChange(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") onChange();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [onChange]);
}
