// Event shapes emitted by POST /api/orchestrations/:id/run/stream.
//
// Every SSE frame has an `event` field as discriminator. Outer-level events
// from the route are `start` / `chunk` / `complete` / `error`. Streaming
// content events are `content_delta` and `reasoning_delta`. Pass-through
// agent-engine events carry their own type as the `event` value.

export interface StartEvent {
  event: "start";
  run_id: string;
  session_id: string;
  reasoning_requested?: boolean;
}

// β: incremental answer tokens. The terminal `chunk` event still arrives at
// the end with the full content, so non-streaming clients can ignore deltas.
export interface ContentDeltaEvent {
  event: "content_delta";
  delta: string;
  type?: string;
}

// Incremental reasoning ("thinking") tokens for a single step.
export interface ReasoningDeltaEvent {
  event: "reasoning_delta";
  step?: number;
  source?: string; // typically "thinking"
  delta: string;
  type?: string;
}

// Final reasoning text for a step (emitted at step completion).
export interface ReasoningEvent {
  event: "reasoning";
  step?: number;
  source?: string;
  content: string;
  type?: string;
}

export interface ChunkEvent {
  event: "chunk";
  content: string;
}

export interface CompleteEvent {
  event: "complete";
  run_id: string;
  session_id: string;
  content?: string;
  status?: string;
  steps?: unknown;
  usage?: unknown;
}

export interface ErrorEvent {
  event: "error";
  error: string;
}

export interface PassThroughEvent {
  event: string;
  [k: string]: unknown;
}

export type OrchestrationEvent =
  | StartEvent
  | ContentDeltaEvent
  | ReasoningDeltaEvent
  | ReasoningEvent
  | ChunkEvent
  | CompleteEvent
  | ErrorEvent
  | PassThroughEvent;
