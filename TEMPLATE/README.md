---
title: <goal-named, e.g. "Per-user knowledge base">
description: <one sentence — what the reader will build>
features: [sources, knowledge-bases, agents, orchestrations-supervisor, sessions, streaming, auth, rls]
time: "<e.g. 30m to run, 2h to understand>"
difficulty: <beginner | intermediate | advanced>
stack: [vite, react, typescript]
---

# <Title>

<2–4 sentences naming the concrete user-facing outcome. Optional screenshot or gif.>

## Powabase features used

<Manual list mirrored from frontmatter `features`. Will be derived automatically by the v2 site.>

## Why this combination

<**Encouraged for hybrid recipes, optional for pure BaaS/AI.** Short paragraph explaining why these features belong together. What breaks if you skip one? E.g., "Without RLS, users see each other's docs. Without Sources, you hand-roll ingestion. Without Agents, you build your own ReAct loop.">

## Prerequisites

- Powabase project created (see the quickstart guide in the main docs)
- `OPENAI_API_KEY` set in your project settings (Project Settings → API keys)
- Node 20+ / npm installed

## Architecture

<Optional. Only when non-obvious. Small mermaid diagram or 3–4 bullets of flow.>

## Build it

### 1. <First concrete step>

<Narrative + code block>

### 2. <Next step>

<Narrative + code block>

## Inspect in Studio

<Optional but encouraged. One to three moments showing what the code produced, via a small screenshot of a focused Studio panel. Example:

**Sources page:** after your upload calls, open Sources → your recipe project. You'll see each file transition from `pending` → `processing` → `ready`.

![Sources processing](./assets/sources-processing.png)

Skip entirely if nothing would change visibly in Studio.>

## Run it

See [`run.md`](./run.md) for setup and execution steps.

## Variations

- <How to swap the LLM provider / add a feature / scale up>
- <Another variation>

## Platform notes

<Optional. Only when the recipe uses a workaround because of an intentional design gap in the platform, e.g. "We poll here because Realtime isn't yet available on Powabase." Not a bug disclosure — remove this section entirely when no gap applies.>
