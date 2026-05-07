# Run it

This recipe has two distinct setup phases:

- **One-time provisioning** — apply schema, seed KBs/agents/orchestration
  against a fresh Powabase project. Run once; it produces an
  `orchestration_id` you'll reuse.
- **Run the app** — Vite dev server reads the orchestration id and the
  user's session, talks to the orchestration's run/stream endpoint.

You can do both in the same shell session.

## 1. Get the recipe folder

If you cloned just the runnable bits via degit:

```bash
npx degit powabase-ai/cookbook/recipes/01-multi-agent-support-team my-support-app
cd my-support-app
```

If you're working inside this monorepo's checkout, you already have the
folder; `cd cookbook/recipes/01-multi-agent-support-team`.

## 2. Spin up a Powabase project

In Studio (or via the control-plane API):

1. Create a new project. Note its name; you'll use it again as the
   "current project" through the rest of these steps.
2. **Project Settings → API Keys → set `OPENAI_API_KEY`** (the agents call
   the LLM; without this the seed step's KB ingestion will succeed but the
   agents themselves will fail at runtime).
3. **Auth → Advanced Settings → toggle "Auto-confirm Email" ON.** Without
   this, sign-up returns a "check your email" state instead of an active
   session, and the chat page can't load.

## 3. Recipe-root environment

Two env files in this recipe — one at the recipe root for setup scripts +
psql, one inside `code/` for the runtime Vite app.

Copy and fill in the recipe-root file:

```bash
cp .env.example .env.local
```

The vars come from **Studio → Project Connect**:

- `VITE_POWABASE_URL` — *API* tab → Project URL
- `POWABASE_SERVICE_ROLE_KEY` — *API* tab → Service Role Key (reveal)
- `DATABASE_URI` — *Connection Strings* tab → Direct/PSQL string

> ⚠️ **Don't wrap the values in quotes.** Plain bash dotenv parses unquoted
> values cleanly; surrounding quotes get included literally.

## 4. Apply schema + RLS to the database

```bash
psql "$DATABASE_URI" -f schema.sql
psql "$DATABASE_URI" -f policies.sql
```

Expected: a few `CREATE` / `ALTER` notices, no errors. Verify:

```bash
psql "$DATABASE_URI" -c \
  "SELECT policyname FROM pg_policies WHERE tablename='chat_sessions';"
```

You should see `chat_sessions_self_all`.

## 5. Seed the AI resources

This creates the orchestration, three KBs (billing/technical/product),
uploads the seed-content/ markdown files into each, creates three entity
agents, and attaches them.

```bash
npm install
npm run seed
```

Expected output ends with the orchestration id you need to copy:

```
✓ Seed complete

Paste this into code/.env.local:
VITE_POWABASE_ORCHESTRATION_ID=<uuid>
```

> **Want the teaching version?** The README walks through the same
> provisioning as four narrated steps. Each step is independently
> runnable and idempotent, with terminal chat probes after each one so
> you can watch the agents work before composition appears:
>
> ```bash
> npm run step:1   # billing KB + agent → chat with it directly
> npm run step:2   # add technical + product specialists
> npm run step:3   # wrap them in a Supervisor orchestration
> ```
>
> `npm run seed` is the all-in-one shortcut — same end state, no narrative.

## 6. Runtime environment (the Vite app)

Different env file inside `code/`:

```bash
cd code
cp .env.example .env.local
```

Fill in:

- `VITE_POWABASE_URL` — same as above
- `VITE_POWABASE_ANON_KEY` — Studio → Project Connect → API → Anon Key
- `VITE_POWABASE_ORCHESTRATION_ID` — paste the value `npm run seed`
  printed in step 5

## 7. Install + run the dev server

```bash
npm install
npm run dev
```

Expected: dev server on **http://localhost:5173/**.

## 8. Verify

1. Open http://localhost:5173/ — redirects to `/signin`.
2. Click "Create an account", sign up with any email + password (8+ chars).
3. You land on `/chat`. The page briefly shows "Loading session…" then the
   chat input becomes active.
4. Send: `What's your refund policy?`
   - Trace panel: `▶ run started` → `▶ orchestration started: supervisor`
     → `→ delegating: billing-agent` (with a task summary) → `🔧 tool_call
     knowledge_base_search` → `✓ tool_result` → `step_completed` →
     `delegation_completed` → `chunk` → `complete`
   - Chat area: an answer appears, citing refund-policy details from the
     billing KB.
5. Send: `How do I authenticate against your API?`
   - Should delegate to `technical-agent`.
6. Send: `What's the difference between Business and Enterprise?`
   - Should delegate to `product-agent`.
7. Refresh the page — you stay signed in, the chat reuses the same
   `agent_session_id`.

If any of the above doesn't happen, see Troubleshooting.

## 9. (Optional) Run the dogfood batteries

Three test scripts come with the recipe. They exercise routing breadth,
RLS isolation, and concurrent throughput:

```bash
# from the recipe root, not inside code/
cd ..
npm run dogfood              # 14-case routing battery against the orchestration
npm run rls-test             # 5 RLS isolation checks (signs up two test users)
npm run concurrency-test     # fires 10 simultaneous orchestration runs
```

These are not necessary to "run the recipe" but are useful when you're
modifying entity prompts or KB content and want to confirm you haven't
regressed routing quality.

## 10. Troubleshooting

- **`401 Unauthorized` on the run/stream endpoint with "missing aud
  claim".** Most likely you pasted the *anon* key into
  `POWABASE_SERVICE_ROLE_KEY` (or vice versa) in the recipe-root
  `.env.local`. The seed script needs service_role; runtime needs anon.
- **`psql: error: ... password authentication failed`.** Check your
  `DATABASE_URI` — Studio's Connection Strings sometimes show
  `[YOUR-PASSWORD]` as a placeholder you have to replace with the actual
  database password from **Project Settings → Database**.
- **Connection string isn't being read by `psql`.** If you wrapped the
  value in quotes (`DATABASE_URI="postgres://..."`), the surrounding quotes
  become part of the string and `psql` falls back to a local socket
  connection. Either remove the quotes or use `set -a; source .env.local;
  set +a` to let bash strip them.
- **Sign-up doesn't return a session.** Double-check
  **Auth → Advanced Settings → Auto-confirm Email** is ON.
- **Chat page hangs at "Loading session…".** Check the browser console for
  a 401 on PostgREST — `VITE_POWABASE_ANON_KEY` may be wrong or you may
  have copied a key from the wrong project.
- **Agents respond but answers feel generic, not citing seeded content.**
  KB indexing on tabular content (e.g., the rate-limit table) is weaker
  than on prose. Either expand the seed content with prose alongside
  tables, or switch the KBs to `indexing_strategy: "page_index"` in
  `seed-agents.ts` and re-run `npm run seed`.
- **Routing miss on "rate limit on Business plan".** This is a known
  recipe-content limitation: "Business plan" sounds product-shaped to the
  coordinator, while the actual rate-limit table is in the technical KB.
  After the prompt patches in `patch-prompts.ts`, the agents now refuse
  honestly rather than hallucinating. To fix at the source, tighten the
  entity role descriptions in `seed-agents.ts` to make rate-limit-style
  questions unambiguously technical.
