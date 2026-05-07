# Run it

## 1. Copy this folder

```bash
npx degit powabase-ai/cookbook/recipes/<NN-slug>/code my-app
cd my-app
```

## 2. Environment

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required runtime variables (read by the Vite app):
- `VITE_POWABASE_URL` — your project's API URL (Studio → Project Connect → API)
- `VITE_POWABASE_ANON_KEY` — your project's anon key (Studio → Project Connect → API)

Recipe-specific resource IDs (see the recipe README for which are needed):
- `VITE_POWABASE_ORCHESTRATION_ID`, `VITE_POWABASE_AGENT_ID`, `VITE_POWABASE_KB_ID`, etc.

Setup-only variables (used by Node seed scripts and `psql`):
- `POWABASE_SERVICE_ROLE_KEY` — service role key (Studio → Project Connect → reveal)
- `DATABASE_URI` — PostgreSQL connection string (Studio → Project Connect → Connection Strings)

## 3. Install

```bash
npm install
```

## 4. Run

```bash
npm run dev
```

Expected: dev server on `http://localhost:5173`.

## 5. Verify

<Recipe-specific verification, e.g. "Open http://localhost:5173, sign in, and send a test question — you should see the expected response and a matching entry appear in Studio → Runs.">

## 6. Troubleshooting

<Common issues surfaced during authoring. Fill in as issues are found.>
