# opencode-wikiskill

> WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution

An [OpenCode](https://opencode.ai) plugin implementing the [WikiSkill framework](https://arxiv.org/abs/2608.27454) (Tang et al., 2026, Google Research).

## What It Does

WikiSkill co-evolves agent skills with a **persistent knowledge base** (wiki). Instead of letting insights from past executions scatter across optimization histories, WikiSkill compiles them into structured, compounding knowledge that guides future skill development.

### Three-Layer Architecture

| Layer      | Directory                     | Purpose                                   | Mutability            |
| ---------- | ----------------------------- | ----------------------------------------- | --------------------- |
| **Raw**    | `.opencode/wikiskill/raw/`    | Execution traces from tool calls          | Immutable             |
| **Wiki**   | `.opencode/wikiskill/wiki/`   | Persistent patterns, logs, impact tracker | **Never rolled back** |
| **Skills** | `.opencode/wikiskill/skills/` | Evolved procedural instructions           | Updated with gating   |

### Evolution Loop

```
┌─────────────────────────────────────────────────────────┐
│                   Evolution Loop                         │
│                                                         │
│  1. Inference Agent executes tasks (sees skills only)   │
│  2. Wiki Maintainer analyzes traces → wiki patterns     │
│  3. Skill Proposer reads wiki → proposes skill edits    │
│  4. Gating validates proposal → accept or rollback      │
│                                                         │
│  Wiki persists across all iterations (never reverts)    │
└─────────────────────────────────────────────────────────┘
```

## Setup

### As a local plugin

Place the plugin directory at `.opencode/plugins/wikiskill/` in your project:

```sh
# From your project root
cp -r /path/to/opencode-wikiskill .opencode/plugins/wikiskill
```

Or reference it in `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/path/to/opencode-wikiskill",
      "options": {
        "sampleSize": 20,
        "maxIterations": 10,
        "verbose": false,
      },
    },
  ],
}
```

### As a published package

```sh
npm install opencode-wikiskill
```

```jsonc
{
  "plugins": [
    {
      "package": "opencode-wikiskill",
      "options": {
        "sampleSize": 20,
        "maxIterations": 10,
      },
    },
  ],
}
```

## Configuration

| Option          | Type      | Default | Description                                                      |
| --------------- | --------- | ------- | ---------------------------------------------------------------- |
| `sampleSize`    | `number`  | `20`    | Number of traces to sample per iteration for the Wiki Maintainer |
| `maxPatterns`   | `number`  | `100`   | Maximum patterns in the wiki before pruning                      |
| `maxIterations` | `number`  | `10`    | Maximum evolution iterations before requiring a reset            |
| `verbose`       | `boolean` | `false` | Enable verbose logging                                           |

## Commands

| Command        | Description                                     |
| -------------- | ----------------------------------------------- |
| `/wiki-evolve` | Run one iteration of the evolution loop         |
| `/wiki-status` | Show evolution statistics, patterns, and logs   |
| `/wiki-reset`  | Reset evolution state (preserves wiki patterns) |

## RPC API

Other plugins and clients can interact with WikiSkill via RPC:

```ts
import { WikiSkill } from "opencode-wikiskill/rpc";

const wikiskill = client.rpc(WikiSkill);

// Get current status
const status = await wikiskill.status();

// Trigger evolution
const result = await wikiskill.evolve({ sampleSize: 20 });

// List patterns
const { patterns } = await wikiskill.patterns();

// Subscribe to events
for await (const event of wikiskill.events.subscribe("evolution_completed")) {
  console.log(`Evolution ${event.data.iteration}: score=${event.data.score}`);
}
```

## How It Maps to the Paper

| WikiSkill Paper          | OpenCode Implementation                             |
| ------------------------ | --------------------------------------------------- |
| §3.1 Raw Layer           | `tool.hook("execute.after")` → `raw/*.jsonl`        |
| §3.1 Wiki Layer          | `wiki/patterns/*.md`, `logs.md`, `skill-impact.md`  |
| §3.1 Skills Layer        | `skills/*.md` + `ctx.skill.transform()`             |
| §3.2.1 Inference Agent   | Normal OpenCode session (sees skills, NOT wiki)     |
| §3.2.2 Wiki Maintainer   | LLM prompt → analyzes traces → writes patterns      |
| §3.2.3 Skill Proposer    | LLM ReAct agent → reads wiki → proposes skill edits |
| §3.2.4 Gating & Rollback | Validation scoring → accept if score > best         |
| §4 Experiments           | `/wiki-evolve` command orchestrates the full loop   |

## Key Design Decisions

1. **Wiki never rolls back** — Even when skill edits are rejected, accumulated knowledge persists
2. **Inference agent ≠ evolution agent** — Skills are the distilled output; the raw wiki is for evolution only
3. **Compounding knowledge** — Each iteration builds on all previous patterns
4. **Cross-session traces** — Traces from all sessions are available for analysis
5. **Filesystem-first** — Wiki is markdown files, making it human-readable and auditable

## License

CC BY 4.0 (same as the paper)
