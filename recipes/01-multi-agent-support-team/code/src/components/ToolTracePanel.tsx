import { useMemo } from "react";
import type { OrchestrationEvent } from "../types/orchestration-events";

export default function ToolTracePanel({
  events,
}: {
  events: OrchestrationEvent[];
}) {
  // β: collapse `reasoning_delta` events into accumulated reasoning blocks
  // per (step, source) so the trace renders one growing block per
  // reasoning episode rather than dozens of individual delta lines.
  const rendered = useMemo(() => collapseReasoningDeltas(events), [events]);

  return (
    <div>
      <h2 className="font-semibold mb-3">Orchestration trace</h2>
      {rendered.length === 0 && (
        <p className="text-sm text-gray-500">No activity yet.</p>
      )}
      <ul className="space-y-2 text-sm">
        {rendered.map((item, i) => (
          <li
            key={i}
            className="border rounded p-2 bg-white break-words overflow-hidden"
          >
            <Row item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ReasoningBlock {
  kind: "reasoning";
  step?: number;
  source?: string;
  content: string;
  finalized: boolean;
}

interface RawEvent {
  kind: "event";
  event: OrchestrationEvent;
}

type Row = ReasoningBlock | RawEvent;

function collapseReasoningDeltas(events: OrchestrationEvent[]): Row[] {
  const out: Row[] = [];
  let active: ReasoningBlock | null = null;

  const flushActive = () => {
    if (active) {
      out.push(active);
      active = null;
    }
  };

  for (const ev of events) {
    // content_delta events stream token-by-token into the chat bubble; they
    // shouldn't appear in the trace (otherwise every token is a styled empty
    // box because EventRow returns null for them).
    if (ev.event === "content_delta") continue;

    if (ev.event === "reasoning_delta") {
      const e = ev as { step?: number; source?: string; delta?: string };
      if (
        active &&
        active.step === e.step &&
        active.source === e.source &&
        !active.finalized
      ) {
        active.content += e.delta ?? "";
      } else {
        flushActive();
        active = {
          kind: "reasoning",
          step: e.step,
          source: e.source,
          content: e.delta ?? "",
          finalized: false,
        };
      }
      continue;
    }

    if (ev.event === "reasoning") {
      // Final reasoning event for a step — supersedes any in-flight
      // streaming accumulator for the same (step, source). Drop the
      // accumulator (don't flush — that would double-render) and push
      // only the finalized version.
      const e = ev as { step?: number; source?: string; content?: string };
      active = null;
      out.push({
        kind: "reasoning",
        step: e.step,
        source: e.source,
        content: e.content ?? "",
        finalized: true,
      });
      continue;
    }

    flushActive();
    out.push({ kind: "event", event: ev });
  }
  flushActive();
  return out;
}

function str(ev: unknown, key: string): string | undefined {
  const v = (ev as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}
function num(ev: unknown, key: string): number | undefined {
  const v = (ev as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}
function bool(ev: unknown, key: string): boolean | undefined {
  const v = (ev as Record<string, unknown>)[key];
  return typeof v === "boolean" ? v : undefined;
}

function Row({ item }: { item: Row }) {
  if (item.kind === "reasoning") return <ReasoningRow block={item} />;
  return <EventRow event={item.event} />;
}

function ReasoningRow({ block }: { block: ReasoningBlock }) {
  const headerColor = block.finalized ? "text-indigo-700" : "text-indigo-500";
  return (
    <div>
      <div className={`flex items-start gap-2 ${headerColor} font-medium`}>
        <span>💭 reasoning</span>
        {block.step !== undefined && (
          <span className="text-xs text-gray-500">step {block.step}</span>
        )}
        {block.source && (
          <span className="text-xs text-gray-500">({block.source})</span>
        )}
        {!block.finalized && (
          <span className="text-xs text-gray-400 animate-pulse">streaming…</span>
        )}
      </div>
      <pre className="mt-1 text-xs text-gray-700 whitespace-pre-wrap break-words">
        {block.content}
      </pre>
    </div>
  );
}

function EventRow({ event }: { event: OrchestrationEvent }) {
  const name = event.event;

  switch (name) {
    case "start":
      return (
        <Line icon="▶" color="text-gray-600" label="run started">
          <code className="text-xs">
            session {str(event, "session_id")?.slice(0, 8) ?? "?"}…
          </code>
        </Line>
      );
    case "content_delta":
      // Don't render in the trace — already streaming into the chat bubble.
      return null;
    case "chunk":
      return (
        <Line icon="✓" color="text-green-700" label="content ready">
          <span className="text-xs text-gray-500">(rendered in chat)</span>
        </Line>
      );
    case "complete":
      return (
        <Line icon="⏹" color="text-gray-500" label="complete">
          <code className="text-xs">
            run {str(event, "run_id")?.slice(0, 8) ?? "?"}…
          </code>
        </Line>
      );
    case "error":
      return (
        <Line icon="⚠" color="text-red-700" label="error">
          <span className="break-words">{str(event, "error") ?? ""}</span>
        </Line>
      );
  }

  switch (name) {
    case "run_started":
      return <Line icon="▶" color="text-gray-700" label="agent run started" />;
    case "orchestration_started": {
      const strategy = str(event, "strategy");
      const orchName = str(event, "name");
      return (
        <Line icon="▶" color="text-purple-700" label="orchestration started">
          <span className="text-xs text-gray-700">
            {strategy && <strong>{strategy}</strong>}
            {orchName && <>: {orchName}</>}
          </span>
        </Line>
      );
    }
    case "orchestration_completed":
      return (
        <Line icon="✓" color="text-purple-700" label="orchestration completed">
          {str(event, "status") && (
            <span className="text-xs text-gray-500">{str(event, "status")}</span>
          )}
        </Line>
      );
    case "step_started": {
      const step = num(event, "step");
      const last = bool(event, "is_last_step");
      return (
        <Line icon="•" color="text-gray-600" label="step started">
          <span className="text-xs text-gray-500">
            step {step ?? "?"}
            {last ? " (last)" : ""}
          </span>
        </Line>
      );
    }
    case "step_completed":
      return <Line icon="✓" color="text-gray-500" label="step completed" />;
    case "delegation_started": {
      const agent = str(event, "agent");
      const task = str(event, "task");
      return (
        <div>
          <Line icon="→" color="text-blue-700" label="delegating" mono={agent} />
          {task && (
            <div className="mt-1 text-xs text-gray-600 pl-6 break-words">
              task: "{task.length > 120 ? task.slice(0, 120) + "…" : task}"
            </div>
          )}
        </div>
      );
    }
    case "delegation_completed":
      return (
        <Line
          icon="✓"
          color="text-blue-700"
          label="delegation returned"
          mono={str(event, "agent")}
        />
      );
    case "tool_call":
      return (
        <Line
          icon="🔧"
          color="text-orange-700"
          label="tool_call"
          mono={str(event, "name") ?? str(event, "tool_name")}
        />
      );
    case "tool_result":
      return (
        <Line
          icon="✓"
          color="text-green-700"
          label="tool_result"
          mono={str(event, "name") ?? str(event, "tool_name")}
        />
      );
  }

  return (
    <div>
      <div className="text-gray-500 font-medium">• {name}</div>
      <details className="mt-1 text-xs text-gray-600">
        <summary className="cursor-pointer select-none">details</summary>
        <pre className="mt-1 bg-gray-50 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(event, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Line({
  icon,
  color,
  label,
  mono,
  children,
}: {
  icon: string;
  color: string;
  label: string;
  mono?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className={`${color} font-medium shrink-0`}>
        {icon} {label}
      </span>
      {mono && <code className="text-xs break-all min-w-0">{mono}</code>}
      {children && <span className="min-w-0 break-words">{children}</span>}
    </div>
  );
}
