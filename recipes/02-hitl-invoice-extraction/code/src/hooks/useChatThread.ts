import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface ChatMessage {
  id: string;
  item_id: string;
  author_id: string;
  content: string;
  attempt_id: string | null;
  created_at: string;
  // Joined from profiles on read.
  author_display_name?: string;
  author_is_agent?: boolean;
}

export function useChatThread(itemId: string): {
  messages: ChatMessage[];
  send: (content: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  async function load() {
    if (!itemId) return;
    const { data } = await supabase
      .from("chat_messages")
      .select(
        `id, item_id, author_id, content, attempt_id, created_at,
         profiles ( display_name, is_agent )`,
      )
      .eq("item_id", itemId)
      .order("created_at", { ascending: true });
    type Row = {
      id: string;
      item_id: string;
      author_id: string;
      content: string;
      attempt_id: string | null;
      created_at: string;
      profiles?: { display_name?: string; is_agent?: boolean };
    };
    const flat = ((data ?? []) as unknown as Row[]).map((row) => ({
      id: row.id,
      item_id: row.item_id,
      author_id: row.author_id,
      content: row.content,
      attempt_id: row.attempt_id,
      created_at: row.created_at,
      author_display_name: row.profiles?.display_name,
      author_is_agent: row.profiles?.is_agent,
    }));
    setMessages(flat as ChatMessage[]);
  }

  useEffect(() => {
    if (!itemId) return;
    const channel = supabase
      .channel(`chat-${itemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `item_id=eq.${itemId}` },
        () => load(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(content: string): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("not signed in");
    await supabase.from("chat_messages").insert({
      item_id: itemId,
      author_id: userData.user.id,
      content,
      attempt_id: null,
    });
  }

  return { messages, send };
}
