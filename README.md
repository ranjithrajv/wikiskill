# WikiSkill for OpenCode

> Co-evolve agent skills with a persistent knowledge base — agents that learn from their mistakes.

[![arXiv](https://img.shields.io/badge/arXiv-2608.27454-b31b1b.svg)](https://arxiv.org/abs/2608.27454)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green.svg)](https://creativecommons.org/licenses/by/4.0/)
[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-blue.svg)](https://opencode.ai)

Based on [WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution](https://arxiv.org/abs/2608.27454) (Tang et al., 2026, Google Research).

---

## What It Does

Your OpenCode agent makes mistakes. WikiSkill remembers them — and turns them into better skills over time.

```
┌─────────────────────────────────────────────────────────┐
│                   Evolution Loop                         │
│                                                         │
│  1. Agent executes tasks (sees skills only)             │
│  2. Wiki Maintainer analyzes traces → wiki patterns     │
│  3. Skill Proposer reads wiki → proposes skill edits    │
│  4. Gating validates proposal → accept or rollback      │
│                                                         │
│  Wiki persists across all iterations (never reverts)    │
└─────────────────────────────────────────────────────────┘
```

**Key insight from the paper:** Knowledge compounds. Even when a skill edit fails, the *lesson* persists in the wiki so future iterations don't repeat the same mistake.

---

## Install

Add to your project's `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/path/to/opencode-wikiskill",
      "options": {
        "sampleSize": 20,
        "maxIterations": 10
      }
    }
  ]
}
```

Or clone directly into your project:

```sh
git clone https://github.com/ranjithrajv/opencode-wikiskill.git .opencode/plugins/wikiskill
```

---

## Quickstart

1. **Work normally** — use OpenCode as you always do. Traces are captured automatically.
2. **Run evolution** — type `/wiki-evolve` in any session.
3. **Check status** — type `/wiki-status` to see patterns, traces, and scores.
4. **Repeat** — each iteration makes your agent a little smarter.

```sh
# After a coding session where the agent hit some errors:
> /wiki-evolve
→ Analyzed 23 traces, found 3 failure patterns
→ Created skill: error-recovery.md
→ Validation score: 0.82 (accepted)

# Next time the agent hits a similar error, it knows what to do.
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/wiki-evolve` | Run one evolution iteration: analyze traces → update wiki → propose skill → validate → gate |
| `/wiki-status` | Show evolution statistics, patterns, and logs |
| `/wiki-reset` | Reset evolution state (preserves wiki patterns) |

---

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sampleSize` | `number` | `20` | Traces sampled per iteration for the Wiki Maintainer |
| `maxPatterns` | `number` | `100` | Maximum patterns before pruning |
| `maxIterations` | `number` | `10` | Maximum evolution iterations before requiring reset |
| `verbose` | `boolean` | `false` | Enable verbose logging |

---

## How It Works

### Three-Layer Architecture

| Layer | Directory | Purpose | Mutability |
|-------|-----------|---------|-----------|
| **Raw** | `.opencode/wikiskill/raw/` | Execution traces from tool calls | Immutable |
| **Wiki** | `.opencode/wikiskill/wiki/` | Persistent patterns, logs, impact tracker | **Never rolled back** |
| **Skills** | `.opencode/wikiskill/skills/` | Evolved procedural instructions | Updated with gating |

### The Wiki Never Forgets

Even when a skill edit is rejected by the gating mechanism, the *knowledge* of why it failed persists in the wiki. This is the core insight from the paper — knowledge compounds across iterations.

### Inference Agent ≠ Evolution Agent

During normal work, your agent only sees evolved **skills** — not the raw wiki. The wiki is reserved for the evolution process. This prevents the agent from "cheating" by reading its own analysis.

---

## RPC API

Other plugins and clients can interact with WikiSkill:

```ts
import { WikiSkill } from "opencode-wikiskill/rpc"

const wikiskill = client.rpc(WikiSkill)

// Get current status
const status = await wikiskill.status()
// { iteration: 3, bestScore: 0.82, evolving: false, patternCount: 7, traceCount: 45 }

// Trigger evolution
const result = await wikiskill.evolve({ sampleSize: 20 })

// List patterns
const { patterns } = await wikiskill.patterns()

// Subscribe to events
for await (const event of wikiskill.events.subscribe("evolution_completed")) {
  console.log(`Iteration ${event.data.iteration}: score=${event.data.score}`)
}
```

---

## Development

Built with [Vite+](https://viteplus.dev) — the unified TypeScript toolchain.

```sh
npm install

npx vp check     # Format + lint + typecheck
npx vp fmt       # Auto-format with Oxfmt
npx vp pack      # Build with tsdown (Rolldown)
npx vp test      # Test with Vitest
```

---

## Paper

If you use this plugin in research, cite the original paper:

```bibtex
@article{tang2026wikiskill,
  title={WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution},
  author={Tang, Liyan and Rashtchian, Cyrus and Ferng, Chun-Sung and Tomkins, Andrew and Juan, Da-Cheng and Vu, Tu},
  journal={arXiv preprint arXiv:2608.27454},
  year={2026}
}
```

---

## Related Work

| Paper | Key Idea | Link |
|-------|----------|------|
| **EvoSkill** | Self-evolving skill discovery via failure analysis | [arXiv:2603.02766](https://arxiv.org/abs/2603.02766) |
| **SkillOpt** | Skill docs as trainable parameters | [arXiv:2605.23904](https://arxiv.org/abs/2605.23904) |
| **Trace2Skill** | Parallel trajectory distillation into skills | [arXiv:2603.25158](https://arxiv.org/abs/2603.25158) |
| **Karpathy's LLM Wiki** | Compounding knowledge concept (inspiration) | [Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) |

---

## License

CC BY 4.0 (same as the paper)
