// Recipe 01 — Phase 16 dogfood driver
//
// Sends a battery of test questions through the orchestration's run/stream
// endpoint, parses SSE events, and reports:
//   - Which entity agent was delegated to (from delegation_started events)
//   - Whether the run completed successfully
//   - The first 200 characters of the final answer
//
// Run from this recipe folder:
//   npm run dogfood
//
// Requires .env.local with VITE_POWABASE_URL + POWABASE_SERVICE_ROLE_KEY +
// VITE_POWABASE_ORCHESTRATION_ID (the seed script printed the latter; you
// need to copy it into .env.local manually for this script to pick it up).

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const BASE_URL = process.env.VITE_POWABASE_URL;
const API_KEY = process.env.POWABASE_SERVICE_ROLE_KEY;
const ORCH_ID = process.env.VITE_POWABASE_ORCHESTRATION_ID;

if (!BASE_URL || !API_KEY || !ORCH_ID) {
  throw new Error(
    "Missing env vars. Need VITE_POWABASE_URL + POWABASE_SERVICE_ROLE_KEY + VITE_POWABASE_ORCHESTRATION_ID in .env.local.",
  );
}

interface TestCase {
  question: string;
  expected: "billing" | "technical" | "product" | "any" | "none";
  category: string;
}

const cases: TestCase[] = [
  // billing domain
  { category: "billing-1", question: "What's your refund policy?", expected: "billing" },
  { category: "billing-2", question: "I was double-charged last month. Can I get my money back?", expected: "billing" },
  { category: "billing-3", question: "Do you accept ACH for monthly plans?", expected: "billing" },

  // technical domain
  { category: "tech-1", question: "How do I authenticate against your API?", expected: "technical" },
  { category: "tech-2", question: "I'm getting a 401 Unauthorized. What's wrong?", expected: "technical" },
  { category: "tech-3", question: "What's the rate limit on the Business plan?", expected: "technical" },

  // product domain
  { category: "product-1", question: "What's the difference between Business and Enterprise?", expected: "product" },
  { category: "product-2", question: "Do you offer SSO?", expected: "product" },
  { category: "product-3", question: "What's included in the Starter plan?", expected: "product" },

  // multi-domain (coordinator may delegate to multiple)
  { category: "multi-1", question: "I can't sign in due to a payment failure — is my account suspended?", expected: "any" },
  { category: "multi-2", question: "I'm on the Business plan and getting rate-limited. Can I upgrade or buy more capacity?", expected: "any" },

  // out-of-domain
  { category: "ood-1", question: "Who is the CEO of Acme Corp?", expected: "none" },
  { category: "ood-2", question: "What's the weather in San Francisco today?", expected: "none" },

  // edge cases
  { category: "edge-empty-vague", question: "Help.", expected: "any" },
];

interface RunResult {
  category: string;
  question: string;
  expected: string;
  delegations: string[];
  completed: boolean;
  status: string | undefined;
  answer: string;
  error?: string;
  durationMs: number;
}

async function runOne(tc: TestCase): Promise<RunResult> {
  const startedAt = Date.now();
  const result: RunResult = {
    category: tc.category,
    question: tc.question,
    expected: tc.expected,
    delegations: [],
    completed: false,
    status: undefined,
    answer: "",
    durationMs: 0,
  };

  try {
    const res = await fetch(
      `${BASE_URL}/api/orchestrations/${ORCH_ID}/run/stream`,
      {
        method: "POST",
        headers: {
          apikey: API_KEY!,
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: tc.question, session_id: null }),
      },
    );
    if (!res.ok || !res.body) {
      result.error = `HTTP ${res.status}: ${await res.text()}`;
      result.durationMs = Date.now() - startedAt;
      return result;
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
          const payload = line.slice(6).trim();
          if (!payload) continue;
          try {
            const ev = JSON.parse(payload) as Record<string, unknown>;
            const evName = ev.event as string;
            if (evName === "delegation_started" && typeof ev.agent === "string") {
              result.delegations.push(ev.agent);
            } else if (evName === "chunk" && typeof ev.content === "string") {
              result.answer = ev.content;
            } else if (evName === "complete") {
              result.completed = true;
              if (typeof ev.status === "string") result.status = ev.status;
            } else if (evName === "error" && typeof ev.error === "string") {
              result.error = ev.error;
            }
          } catch {
            // ignore malformed
          }
        }
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

function expectedOk(tc: TestCase, delegations: string[]): boolean {
  if (tc.expected === "none") return delegations.length === 0;
  if (tc.expected === "any") return true; // any routing is OK; we look at the answer
  return delegations.some((d) => d.includes(tc.expected));
}

function trunc(s: string, n: number): string {
  s = s.replace(/\s+/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n) + "…";
}

async function main() {
  console.log(`Running ${cases.length} dogfood cases against ${BASE_URL}\n`);

  const results: RunResult[] = [];
  for (const tc of cases) {
    process.stdout.write(`  [${tc.category}] ${trunc(tc.question, 60)} ... `);
    const r = await runOne(tc);
    const passes = !r.error && r.completed && expectedOk(tc, r.delegations);
    console.log(
      passes ? `OK (${r.durationMs}ms)` : `FAIL (${r.error ?? "wrong route or no completion"})`,
    );
    results.push(r);
  }

  console.log("\n=== Summary ===\n");
  let pass = 0;
  for (const r of results) {
    const passes = !r.error && r.completed && expectedOk(cases.find((c) => c.category === r.category)!, r.delegations);
    if (passes) pass++;
    console.log(
      `  ${passes ? "✓" : "✗"} ${r.category.padEnd(18)} delegated=[${r.delegations.join(",") || "-"}] expected=${r.expected.padEnd(10)} status=${r.status ?? "-"} t=${r.durationMs}ms`,
    );
    if (r.answer) {
      console.log(`        answer: ${trunc(r.answer, 200)}`);
    }
    if (r.error) {
      console.log(`        ERROR: ${r.error}`);
    }
  }
  console.log(`\n${pass}/${results.length} passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
