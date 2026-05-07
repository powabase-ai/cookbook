// Recipe 01 — Phase 16 concurrency / rapid-fire test
//
// Fires N orchestration runs simultaneously and reports timings + errors.
// Intent: surface rate-limit, race-condition, or token-budget issues that
// only show up under load.
//
// Run from this recipe folder:
//   npm run concurrency-test

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BASE_URL = process.env.VITE_POWABASE_URL!;
const API_KEY = process.env.POWABASE_SERVICE_ROLE_KEY!;
const ORCH_ID = process.env.VITE_POWABASE_ORCHESTRATION_ID!;

const N = 10;

const questions = [
  "What's your refund policy?",
  "How do I authenticate?",
  "What's in the Starter plan?",
  "Do you accept ACH?",
  "What's the rate limit on Business?",
  "Do you offer SSO?",
  "I got a 401, what do I do?",
  "Difference between Business and Enterprise?",
  "How long do refunds take?",
  "How do I create an API key?",
];

interface RunStat {
  question: string;
  status: number | null;
  completed: boolean;
  delegations: string[];
  error?: string;
  durationMs: number;
}

async function runOne(question: string): Promise<RunStat> {
  const startedAt = Date.now();
  const r: RunStat = {
    question,
    status: null,
    completed: false,
    delegations: [],
    durationMs: 0,
  };
  try {
    const res = await fetch(
      `${BASE_URL}/api/orchestrations/${ORCH_ID}/run/stream`,
      {
        method: "POST",
        headers: {
          apikey: API_KEY,
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: question, session_id: null }),
      },
    );
    r.status = res.status;
    if (!res.ok || !res.body) {
      r.error = `HTTP ${res.status}: ${await res.text()}`;
      r.durationMs = Date.now() - startedAt;
      return r;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6).trim()) as Record<string, unknown>;
            if (ev.event === "delegation_started" && typeof ev.agent === "string") {
              r.delegations.push(ev.agent);
            } else if (ev.event === "complete") {
              r.completed = true;
            } else if (ev.event === "error" && typeof ev.error === "string") {
              r.error = ev.error;
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (err) {
    r.error = err instanceof Error ? err.message : String(err);
  }
  r.durationMs = Date.now() - startedAt;
  return r;
}

async function main() {
  console.log(`Firing ${N} orchestration runs in parallel...\n`);
  const startedAt = Date.now();
  const results = await Promise.all(questions.slice(0, N).map(runOne));
  const totalMs = Date.now() - startedAt;

  console.log("=== Results ===\n");
  let ok = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const passes = r.completed && !r.error;
    if (passes) ok++;
    const q = r.question.length > 50 ? r.question.slice(0, 50) + "…" : r.question;
    console.log(
      `  ${passes ? "✓" : "✗"} [${String(i + 1).padStart(2, "0")}] ${r.durationMs}ms status=${r.status} delegated=[${r.delegations.join(",") || "-"}] :: ${q}`,
    );
    if (r.error) console.log(`        ERROR: ${r.error}`);
  }

  const durations = results.filter((r) => r.completed).map((r) => r.durationMs);
  durations.sort((a, b) => a - b);
  const median = durations[Math.floor(durations.length / 2)];
  const max = durations[durations.length - 1];

  console.log(
    `\nOK ${ok}/${results.length} | wall-clock ${totalMs}ms | median ${median ?? "-"}ms | max ${max ?? "-"}ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
