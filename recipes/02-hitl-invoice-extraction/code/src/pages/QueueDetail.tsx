import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  runAgentNonStreaming,
  getSourcePageTexts,
  pageTextsToContext,
  stripJsonFences,
} from "../lib/powabase-api";
import {
  isValidFieldPath,
  applyFieldPatch,
  readFieldValue,
} from "../lib/field-paths";
import { useItemRealtime } from "../hooks/useItemRealtime";
import { usePresence } from "../hooks/usePresence";
import { useChatThread } from "../hooks/useChatThread";
import type { QueueItem } from "../types/invoice";
import PageImageViewer from "../components/PageImageViewer";
import ExtractionForm from "../components/ExtractionForm";
import PresencePanel from "../components/PresencePanel";
import ChatThread from "../components/ChatThread";

export default function QueueDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<QueueItem | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selfState, setSelfState] = useState<{ profile_id: string; display_name: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("id", userData.user.id)
        .single();
      if (profile) setSelfState({ profile_id: profile.id, display_name: profile.display_name });
    })();
  }, []);
  const viewers = usePresence(id ?? "", selfState);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await supabase
      .from("items")
      .select("*")
      .eq("id", id)
      .single();
    if (err) {
      setError(err.message);
      return;
    }
    const it = data as QueueItem;
    setItem(it);
    try {
      const pages = await getSourcePageTexts(it.source_id);
      setPageCount(pages.length);
    } catch (e) {
      // Page-image endpoint may not be available; recipe still works without it.
      console.warn("page-texts:", (e as Error).message);
    }
  }, [id]);

  useItemRealtime(id ?? "", load);

  const { messages: chatMessages, send: sendChat } = useChatThread(id ?? "");

  // ─── Agent id + agent-profile id caching (one round-trip each at mount) ───
  // We start directly with the platform's REST list endpoint. (An earlier
  // draft attempted a PostgREST view first; the ai schema isn't exposed via
  // PostgREST by default, so the view query 4xx'd on every mount and confused
  // readers. /api/agents is the right surface here.)
  const [agentIds, setAgentIds] = useState<{ field?: string; glCoder?: string }>({});
  const [agentProfileId, setAgentProfileId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${import.meta.env.VITE_POWABASE_URL}/api/agents`, {
        headers: {
          apikey: import.meta.env.VITE_POWABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_POWABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) return;
      const list = await res.json();
      const agents = Array.isArray(list) ? list : (list.agents ?? []);
      const field = agents.find((a: { name: string }) => a.name === "field-extractor-agent");
      const glCoder = agents.find((a: { name: string }) => a.name === "gl-coder-agent");
      setAgentIds({ field: field?.id, glCoder: glCoder?.id });
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("display_name", "Field Extractor")
        .eq("is_agent", true)
        .maybeSingle();
      if (data) setAgentProfileId(data.id);
    })();
  }, []);

  // Whether the @agent / "Ask agent" surfaces are ready for use.
  const reExtractionReady = !!agentIds.field && !!agentProfileId;

  // Single source of truth for re-extraction. Both the chat parser and the
  // per-field button call this with a known fieldPath.
  async function triggerReExtraction(
    fieldPath: string,
    hint: string,
    via: "chat" | "form-button",
  ): Promise<void> {
    if (!item || !item.draft_extraction || !id) return;
    if (!reExtractionReady) {
      // Defensive — UI should already disable triggers until ready, but if the
      // user wins the race, keep the failure visible.
      if (agentProfileId) {
        await supabase.from("chat_messages").insert({
          item_id: id,
          author_id: agentProfileId,
          content:
            "Field-extractor agent isn't loaded yet. Please retry in a moment.",
        });
      }
      return;
    }

    if (!isValidFieldPath(fieldPath, item.draft_extraction)) {
      if (agentProfileId) {
        await supabase.from("chat_messages").insert({
          item_id: id,
          author_id: agentProfileId,
          content:
            `"${fieldPath}" isn't a supported field. Use one of: vendor.name, ` +
            "vendor.address, invoice_number, invoice_date, due_date, subtotal, " +
            "tax, total, line_items[N].(description|quantity|unit_price|amount).",
        });
      }
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    // Log the user's request to chat so other reviewers see it (whether they
    // pressed the form button or typed @agent in the thread).
    const userMsgContent =
      via === "form-button"
        ? `(via Ask agent button) ${fieldPath}: ${hint}`
        : `@agent ${fieldPath}: ${hint}`;
    await supabase.from("chat_messages").insert({
      item_id: id,
      author_id: userData.user.id,
      content: userMsgContent,
    });

    // Surface any error after the user-request insert as an agent-authored
    // chat message so the failure is visible in the thread (network errors,
    // 4xx/5xx, JSON parse, missing agent ids, etc. all flow through here).
    try {
      const pages = await getSourcePageTexts(item.source_id);
      const currentValue = readFieldValue(item.draft_extraction, fieldPath);
      const userMsg =
        `TARGET_FIELD: ${fieldPath}\n` +
        `HINT: ${hint}\n` +
        `CURRENT_VALUE: ${String(currentValue ?? "(none)")}`;

      const raw = await runAgentNonStreaming(
        agentIds.field!,
        userMsg,
        pageTextsToContext(pages),
      );

      let parsed: { value: unknown; _confidence: number; explanation: string };
      try {
        parsed = JSON.parse(stripJsonFences(raw));
      } catch {
        await supabase.from("chat_messages").insert({
          item_id: id,
          author_id: agentProfileId!,
          content:
            "The agent's response wasn't valid JSON. Try rephrasing the hint, " +
            "or fix the field manually with an inline edit.",
        });
        return;
      }

      if (parsed.value === null || parsed._confidence < 0.6) {
        await supabase.from("chat_messages").insert({
          item_id: id,
          author_id: agentProfileId!,
          content:
            `I couldn't find a confident value for ${fieldPath} from the hint ` +
            `(confidence ${parsed._confidence.toFixed(2)}). ${parsed.explanation}`,
        });
        return;
      }

      // applyFieldPatch coerces numeric values (handles "€1,209.60" etc.).
      // It throws on uncoercible input; the outer try/catch surfaces the
      // failure as a chat message. Read the stored value back so the success
      // message reflects the canonical (coerced) value, not the raw LLM
      // string.
      //
      // NOTE: not atomic — three round-trips (UPDATE items, INSERT
      // extraction_attempts, INSERT chat_messages) with no transaction. A
      // client crash mid-way leaves a partial trail. See README §Platform
      // notes for the production mitigation (single server-mediated RPC).
      const newDraft = applyFieldPatch(
        item.draft_extraction,
        fieldPath,
        parsed.value,
        parsed._confidence,
      );
      const storedValue = readFieldValue(newDraft, fieldPath);
      await supabase.from("items").update({ draft_extraction: newDraft }).eq("id", id);

      const { data: attemptRow } = await supabase
        .from("extraction_attempts")
        .insert({
          item_id: id,
          target_field: fieldPath,
          hint,
          extraction: newDraft,
          attempted_by: agentProfileId!,
        })
        .select("id")
        .single();

      await supabase.from("chat_messages").insert({
        item_id: id,
        author_id: agentProfileId!,
        content:
          `Updated ${fieldPath} → ${String(storedValue)} ` +
          `(confidence ${parsed._confidence.toFixed(2)}). ${parsed.explanation}`,
        attempt_id: attemptRow?.id ?? null,
      });
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.error("triggerReExtraction failed:", err);
      if (agentProfileId) {
        await supabase.from("chat_messages").insert({
          item_id: id,
          author_id: agentProfileId,
          content: `I hit an error while re-extracting: ${msg}`,
        });
      }
    }
  }

  // Power-user chat path: parses "fieldPath: hint" out of a free-form chat
  // message, then calls triggerReExtraction. The form button is the primary
  // surface; this is the side-channel for readers who want to drive
  // everything from the chat thread.
  async function atAgent(rawHint: string): Promise<void> {
    const m = /^([\w.[\]]+):\s*(.+)$/s.exec(rawHint);
    if (!m) {
      if (id && agentProfileId) {
        await supabase.from("chat_messages").insert({
          item_id: id,
          author_id: agentProfileId,
          content:
            "Couldn't parse a target field. Use `@agent <field>: <hint>` " +
            "(e.g. `@agent invoice_number: it's on page 2 top-right`), or " +
            "click the 'Ask agent' button next to a field in the form.",
        });
      }
      return;
    }
    await triggerReExtraction(m[1], m[2], "chat");
  }

  async function patchField(path: string, newValue: unknown): Promise<void> {
    if (!item || !item.draft_extraction) return;
    const newDraft = applyFieldPatch(item.draft_extraction, path, newValue, 1.0);
    // confidence after a manual edit is 1.0 — the human said so.
    const { error: err } = await supabase
      .from("items")
      .update({ draft_extraction: newDraft })
      .eq("id", item.id);
    if (err) {
      setError(err.message);
      return;
    }
    // Append history attempt.
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      await supabase.from("extraction_attempts").insert({
        item_id: item.id,
        target_field: path,
        hint: null,
        extraction: newDraft,
        attempted_by: userData.user.id,
      });
    }
    await load();
  }

  async function approve() {
    if (!item) return;
    // NOTE: not atomic — see README §Platform notes. The GL-coder fires
    // AFTER the status flip; if the client crashes between these two steps,
    // the item is approved but has no gl_codes. Mirror in trigger-extractions
    // (auto-approval path) handles the same issue at server side; both share
    // the same v1 non-goal.
    await supabase
      .from("items")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", item.id);
    if (agentIds.glCoder && item.draft_extraction) {
      try {
        const userMsg = JSON.stringify({
          vendor_name: item.draft_extraction.vendor.name,
          total: item.draft_extraction.total.value,
          line_items: item.draft_extraction.line_items.map((li, i) => ({ index: i, ...li })),
        });
        const raw = await runAgentNonStreaming(agentIds.glCoder, userMsg);
        const codes = JSON.parse(stripJsonFences(raw)) as Array<{
          line_item_index: number;
          gl_code: string;
          rationale: string;
          needs_cfo_review: boolean;
          _confidence: number;
        }>;
        for (const e of codes) {
          await supabase.from("gl_codes").insert({
            item_id: item.id,
            line_item_index: e.line_item_index,
            gl_code: e.gl_code,
            rationale: e.rationale,
            needs_cfo_review: e.needs_cfo_review,
            confidence: e._confidence,
          });
        }
      } catch (err) {
        console.error("GL-coder failed:", err);
      }
    }
    navigate("/queue");
  }

  async function reject() {
    if (!item) return;
    await supabase
      .from("items")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", item.id);
    navigate("/queue");
  }

  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;
  if (!item) return <div className="p-6">Loading…</div>;

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b p-3 flex items-center justify-between">
        <Link to="/queue" className="text-sm underline">← back to queue</Link>
        <div className="flex items-center gap-4">
          <PresencePanel viewers={viewers} selfId={selfState?.profile_id ?? null} />
          <h1 className="font-semibold">
            {item.draft_extraction?.vendor.name ?? "(unknown vendor)"}
          </h1>
        </div>
        <div className="text-sm text-gray-500">
          status: <span className="font-mono">{item.status}</span>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r">
          <PageImageViewer sourceId={item.source_id} pageCount={pageCount} />
        </div>
        <div className="w-1/2 overflow-auto p-4 flex flex-col gap-6">
          {item.draft_extraction ? (
            <>
              <ExtractionForm
                item={item}
                onApprove={approve}
                onReject={reject}
                onPatchField={patchField}
                onAskAgent={(fieldPath, hint) => triggerReExtraction(fieldPath, hint, "form-button")}
                reExtractionReady={reExtractionReady}
              />
              <div className="border-t pt-4 flex-1 min-h-[300px]">
                <ChatThread
                  messages={chatMessages}
                  onSend={sendChat}
                  onAtAgent={atAgent}
                />
              </div>
            </>
          ) : (
            <p className="text-red-600">
              Extraction failed: {item.extraction_error ?? "unknown error"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
