# Run it

This recipe has two distinct setup phases:

- **One-time provisioning** — apply schema + policies, seed the
  vendor-history KB, the three agents, the sample PDFs, and process the
  initial extraction queue against a fresh Powabase project.
- **Run the app** — Vite dev server reads the user's session, talks to
  Postgres directly via PostgREST + Realtime, and calls the field-extractor
  / GL-coder agents on demand.

You can do both in the same shell session. See [`README.md`](./README.md)
for the narrative arc — what each agent does, how the typed-row handoff
works, why the policy file is shaped the way it is.

> This recipe assumes you've already worked through Recipe 01. Agent
> provisioning, KB uploads, and seed-script patterns aren't re-taught here.

## 1. Get the recipe folder

If you cloned just the runnable bits via degit:

```bash
npx degit powabase-ai/cookbook/recipes/02-hitl-invoice-extraction my-invoice-app
cd my-invoice-app
```

If you're working inside this monorepo's checkout, you already have the
folder; `cd cookbook/recipes/02-hitl-invoice-extraction`.

## 2. Spin up a Powabase project

In Studio (or via the control-plane API):

1. Create a new project — this recipe was developed against one named
   `cookbook-02`. Use whatever name you like, but keep it consistent
   through the rest of these steps.
2. **Project Settings → API Keys → set `OPENAI_API_KEY`** (all three
   agents call the LLM; without this the seed step's KB ingestion will
   succeed but the agents themselves will fail when `trigger:extractions`
   runs).
3. **Auth → Advanced Settings → toggle "Auto-confirm Email" ON.** Without
   this, sign-up returns a "check your email" state instead of an active
   session, and the queue page can't load. The recipe needs two users
   signed in simultaneously for the multi-user verification step — both
   sign-ups must produce sessions immediately.

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
> values cleanly; surrounding quotes get included literally and `psql`
> falls back to a local socket connection.

## 4. Apply schema + policies

```bash
set -a; source .env.local; set +a
psql "$DATABASE_URI" -f schema.sql
psql "$DATABASE_URI" -f policies.sql
```

Expected: a few `CREATE` / `ALTER` notices, no errors. Verify the
shared-workspace policy landed (this is the recipe's first teaching
moment; see [`policies.sql`](./policies.sql)):

```bash
psql "$DATABASE_URI" -c \
  "SELECT policyname FROM pg_policies WHERE tablename='items';"
```

You should see `items_read`, `items_update`, and friends — every row
visible to every authenticated reviewer (no `auth.uid() = user_id`
scoping). That's deliberate: this is a queue, not a per-user inbox.

## 5. Generate sample invoices

The recipe ships six intentionally-varied sample invoices as PDFs (clean,
high-value, tabular, arithmetic-mismatch, smudged, multi-currency). They
exist as TypeScript spec under `seed-content/` and need to be rendered to
PDF before upload.

```bash
npm install
npm run generate-samples
```

Expected: ~30 seconds, six files written to `seed-content/*.pdf`.

## 6. Seed AI resources

This creates the vendor-history KB, indexes its seed corpus, provisions
three agents (extractor, field-extractor, GL-coder) plus a corresponding
`auth.users` + `profiles` row for each, and uploads the six sample PDFs
into `ai.sources`.

```bash
npm run seed
```

Expected: ~3–5 minutes total. Most of the wall-time is KB indexing +
per-PDF page-text + page-image extraction. Output ends with:

```
✓ Seed complete.
  Next: run `npm run trigger:extractions` to process the uploaded invoices.
```

> The seed script is idempotent — re-running it skips KBs / agents / source
> uploads that already exist. Useful when you tweak an agent prompt and
> just want the new version to land.

## 7. Process the queue (one-shot)

`trigger:extractions` walks every `ai.sources` row that doesn't yet have a
matching `items` row, runs the extractor against each one, and inserts the
typed result. The auto-approval gates (per-field confidence ≥ 0.85,
arithmetic, required fields) decide between `approved` (immediate
GL-coder) and `escalated` (queue).

```bash
npm run trigger:extractions
```

Expected: per-source log lines like
`inserted item abcd1234… confidence=✓ arithmetic=✓ required=✓ → all gates
pass; auto-approving + invoking GL-coder` for the clean samples, and
`→ escalated` for the rest. Out of the six samples, you should see
roughly two auto-approve and four escalate — the exact split depends on
LLM stochasticity but the design is most-escalate-by-construction.

## 8. Verify with dogfood

The recipe ships an end-to-end assertion script that walks every `items`
row and checks the typed-handoff invariants (approved → has gl_codes,
arithmetic_valid agrees with the trigger, every item has at least one
`extraction_attempts` row, etc.).

```bash
npm run dogfood
```

Expected final line:

```
✓ all assertions pass
```

If you see `✗ N failure(s)`, the rest of the output enumerates which
items failed which check — usually a sign that a sample didn't extract
cleanly and the gate logic flagged it correctly. Re-run
`trigger:extractions` against just that source if you suspect a transient
LLM hiccup.

## 9. Runtime environment

A different env file inside `code/` — this one only carries the public
keys the browser needs:

```bash
cd code
cp .env.example .env.local
```

Fill in:

- `VITE_POWABASE_URL` — same as the recipe-root value
- `VITE_POWABASE_ANON_KEY` — Studio → Project Connect → API → Anon Key

> The runtime app never sees the service-role key. All writes happen
> through PostgREST under the reviewer's session, governed by the policies
> from step 4.

## 10. Install + run the dev server

```bash
npm install
npm run dev
```

Expected: dev server on **http://localhost:5173/**.

## 11. Verify the multi-user flow

Open **two** browser windows side-by-side — different Chrome profiles, or
one Chrome + one Firefox. The recipe is pointless single-window; presence
and live updates only earn their keep when there's another reviewer in
the room.

**Window A:**

1. Open http://localhost:5173/ — redirects to `/signin`.
2. Click "Create an account", sign up as `reviewer-a@example.com` (any
   email, any password 8+ chars).
3. You land on `/queue`. The list shows the escalated items from step 7,
   each with vendor, total, due date, page-image thumbnail.
4. Click any escalated row — you arrive at `/queue/:id`. The page-image
   viewer is on the left, the structured-edit form on the right with a
   confidence pill next to every field.
5. Edit a low-confidence field directly in the form (e.g., type a
   corrected vendor name). The patch lands on `items.draft_extraction`
   and a new `extraction_attempts` row appears.
6. Click **Approve**. Status flips to `approved`, the row vanishes from
   the queue list, and the GL codes panel fills in as the GL-coder
   finishes per line item.

**Window B (new browser profile):**

1. Sign up as `reviewer-b@example.com`.
2. Navigate to the same item URL window A is on (or pick another
   escalated item; the chat thread / presence behave the same way).
3. The avatar pills at the top of the detail page should show **both**
   reviewers — `reviewer-a` and `reviewer-b`. That's Realtime Presence:
   each client publishes `{ profile_id, display_name }` on the
   `item:<id>:viewers` channel and renders everyone else's `track`.
4. Post a chat message in window B's chat thread.
5. Without doing anything in window A, the message should land in window
   A's chat panel within a second or two — that's Postgres Changes on
   `chat_messages` fanning the INSERT to every connected client.
6. (Optional, on the smudged-invoice sample) post a chat message starting
   with `@agent` plus a hint, e.g. `@agent the invoice number is in the
   top-right of page 2`. The field-extractor agent fires, patches the
   target field on `items.draft_extraction`, and replies in the chat
   thread. Both windows see the field update and the agent's reply at
   the same time.

If presence avatars never appear or chat messages don't land live in the
other window, see Troubleshooting.

## 12. Watch mode for the live demo

For demoing the realtime layer to someone over your shoulder, run the
extractor in a side terminal so new escalations stream in while the UI is
open:

```bash
# Terminal A:
npm run trigger:extractions -- --watch
# Terminal B:
cd code && npm run dev
```

`--watch` polls `ai.sources` every 5 seconds. Drop a fresh PDF into the
project's storage (Studio → Storage, or via the recipe's `upload-invoices`
script with a new file in `seed-content/`); within ~5–15 seconds you'll
see the new escalation appear in every connected browser's queue without
a refresh.

## 13. (Optional) Probe scripts

Two CLI scripts mirror the React UI's flow without needing the dev
server. Useful when you're modifying agent prompts and want a tighter
loop than browser-clicking through the UI.

```bash
npm run probe:field-extract
# pass --item <uuid> --field invoice_number --hint "..." or rely on the
# script's defaults (it picks the first escalated item).

npm run probe:gl-coder
# approve a clean item from the CLI; watch gl_codes appear.
```

Same pattern Recipe 01 uses with its `step:1` / `step:2` / `step:3`
scripts — terminal-first verification that the typed-handoff chain works
before you try to debug it through the UI.

## 14. Troubleshooting

- **Sign-up doesn't return a session.** Double-check
  **Auth → Advanced Settings → Auto-confirm Email** is ON. Without it,
  sign-up returns a "check your email" payload and the queue page can't
  load — the multi-user verification step in particular needs both
  sign-ups to produce sessions immediately.
- **`psql: error: ... password authentication failed`.** Check your
  `DATABASE_URI` — Studio's Connection Strings sometimes show
  `[YOUR-PASSWORD]` as a placeholder you have to replace with the actual
  database password from **Project Settings → Database**.
- **Connection string isn't being read by `psql`.** If you wrapped the
  value in quotes (`DATABASE_URI="postgres://..."`), the surrounding
  quotes become part of the string and `psql` falls back to a local
  socket. Either remove the quotes or use `set -a; source .env.local;
  set +a` to let bash strip them — that's why step 4 leads with that
  exact line.
- **Queue page hangs at "Loading…" / 401 on PostgREST.**
  `VITE_POWABASE_ANON_KEY` is wrong or copied from the wrong project.
  Re-grab it from Studio → Project Connect → API → Anon Key for the
  current project. Note the recipe-root file uses the **service-role**
  key (`POWABASE_SERVICE_ROLE_KEY`) and `code/.env.local` uses the
  **anon** key — these are not interchangeable.
- **Multi-window flow: window B never sees window A's chat / field
  updates.** First check the browser console for a Realtime connection
  error (look for `phx_close` or repeated `phx_join` failures). The
  Supabase JS client subscribes via WebSocket to a per-project Realtime
  service; on older or partially-provisioned projects the per-project
  Realtime tenant may not be wired up. Modern Powabase projects
  provision this automatically — if you're hitting it, file an issue
  in the cookbook repo with your project ref. As a quick sanity check, the
  REST path is independent of Realtime, so reloading window B should
  show the chat message that window A posted; if reload works but live
  doesn't, it's the Realtime layer specifically.
