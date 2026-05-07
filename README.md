# Powabase Cookbook

Goal-oriented recipes for building on Powabase — short working apps that teach you how to use the platform end-to-end.

## Who this is for

Capable developers with varying AI familiarity who want to see real, working examples of what's possible on Powabase. Each recipe is a small story that composes multiple platform features to achieve a concrete outcome.

Beginners and AI-native power users will still find value here, but the editorial focus is the capable-generalist developer evaluating the platform.

## How recipes are organized

Each recipe lives in `recipes/NN-slug/` and contains:

- `README.md` — the story of what you're building and why
- `run.md` — setup and execution steps
- `code/` — runnable source you can clone and extend
- Optional: `schema.sql`, `policies.sql`, `.env.example`, `assets/` (screenshots)

Recipes are self-contained. `cd` into any recipe folder, follow `run.md`, and you have a working app.

## UI vs API

Every recipe's primary execution path is code you can run. Studio is a **companion surface** — each recipe includes one to three optional *Inspect in Studio* moments where you're invited to look at what your code just produced from Studio's angle. You never need to click through Studio to complete a recipe; it's there to build intuition and help you discover features you'd otherwise miss.

## What you'll write

Powabase is a Supabase superset, so the BaaS surfaces — auth (GoTrue), row-level security, REST (PostgREST), and Realtime (Postgres Changes / Presence / Broadcast) — work through the standard Supabase client libraries. Existing Supabase SDK knowledge transfers directly; the recipes use `@supabase/supabase-js` for those bits.

Powabase's distinctive surfaces — agents, orchestrations, workflows, sources, knowledge bases — are exposed as plain HTTP endpoints under `/api/`. Recipes call them with `fetch`, no separate SDK to install. Each recipe's narrative shows the exact request shapes inline.

## Recipes

| # | Recipe | Kind | Difficulty | Status |
|---|---|---|---|---|
| 01 | [Multi-agent customer support team (Supervisor)](recipes/01-multi-agent-support-team/) | Hybrid (flagship) | Intermediate | Available |
| 02 | [HITL invoice extraction queue](recipes/02-hitl-invoice-extraction/) | Hybrid | Intermediate | Available |
| 03 | User management from Supabase | Pure BaaS | Beginner | Planned |
| 04 | AI ticket auto-triage with vision + DB tool | Hybrid | Intermediate | Planned |
| 05 | Semantic product search | Pure AI | Intermediate | Planned |
| 06 | Q&A over your PDFs with citations | Pure AI | Beginner–Intermediate | Planned |

## Learning arc

Recipe 01 is the flagship single-agent-team pattern — start there to see Powabase's multi-agent orchestration surface in isolation. Recipe 02 stacks on it: the same agents-as-real-auth-users foundation plus realtime, presence, and multi-user editing inside a human-in-the-loop workflow. Read 01 first; 02 builds on its patterns and doesn't re-teach them.

Once the planned recipes ship, the suggested ramp will be: Recipe 03 (pure BaaS foundations) → Recipe 06 or 05 (pure AI primitives in isolation) → Recipes 01, 02, and 04 (hybrid compositions).

If you're looking for a specific pattern, jump to the recipe that matches your use case. Each recipe's frontmatter lists the `features:` it exercises — use that to find recipes that overlap with what you're building.

## Issues & feedback

Spot a bug, have a question, or want to suggest a new recipe? [Open an issue](https://github.com/powabase-ai/cookbook/issues).

This repo is a public mirror — recipes are authored in Powabase's internal monorepo and synced here on every push, so PRs against this repo can't be merged directly. File issues and we'll pick them up upstream.

## License

[MIT](LICENSE) — recipe code is yours to clone, modify, and ship.
