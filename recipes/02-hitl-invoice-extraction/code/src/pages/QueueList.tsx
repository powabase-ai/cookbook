import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useQueueRealtime } from "../hooks/useQueueRealtime";
import type { QueueItem } from "../types/invoice";

export default function QueueList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("items")
      .select("*")
      .eq("status", "escalated")
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setItems((data ?? []) as QueueItem[]);
    setLoading(false);
  }, []);

  useQueueRealtime(refresh);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/signin");
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="px-3 py-1 text-sm border rounded"
          >
            Refresh
          </button>
          <button
            onClick={signOut}
            className="px-3 py-1 text-sm text-gray-600 underline"
          >
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="text-gray-500 text-sm">
          Nothing escalated. Either nothing's been processed yet, or the
          extractor auto-approved everything.
        </p>
      )}

      <ul className="space-y-3">
        {items.map((it) => {
          const draft = it.draft_extraction;
          return (
            <li key={it.id} className="border rounded p-3 hover:bg-gray-50">
              <Link to={`/queue/${it.id}`} className="block">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">
                      {draft?.vendor.name ?? "(unknown vendor)"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {draft?.invoice_number.value ?? "—"} ·
                      due {draft?.due_date.value ?? "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">
                      ${draft?.total.value?.toFixed(2) ?? "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      arithmetic{" "}
                      {draft?._arithmetic_valid === false ? "✗" : "✓"}
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
