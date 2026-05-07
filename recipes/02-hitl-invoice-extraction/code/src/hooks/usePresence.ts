import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface ViewerState {
  profile_id: string;
  display_name: string;
}

export function usePresence(itemId: string, self: ViewerState | null): ViewerState[] {
  const [viewers, setViewers] = useState<ViewerState[]>([]);

  useEffect(() => {
    if (!itemId || !self) return;

    const channel = supabase.channel(`item:${itemId}:viewers`, {
      config: { presence: { key: self.profile_id } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<ViewerState>();
      const flat: ViewerState[] = [];
      for (const arr of Object.values(state)) {
        for (const v of arr) flat.push({ profile_id: v.profile_id, display_name: v.display_name });
      }
      setViewers(flat);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track(self);
      }
    });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [itemId, self?.profile_id]); // eslint-disable-line react-hooks/exhaustive-deps

  return viewers;
}
