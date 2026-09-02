# WikiSkill

> Co-evolve agent skills with a persistent knowledge base — agents that learn from their mistakes.

[![arXiv](https://img.shields.io/badge/arXiv-2608.27454-b31b1b.svg)](https://arxiv.org/abs/2608.27454)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green.svg)](https://creativecommons.org/licenses/by/4.0/)
[![OpenCode](https://img.shields.io/badge/OpenCode-plugin-blue.svg)](https://opencode.ai)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-adapter-blue.svg)](https://claude.ai/code)
[![Codex CLI](https://img.shields.io/badge/Codex%20CLI-adapter-blue.svg)](https://developers.openai.com/codex)

Harness-agnostic by design: the evolution engine (`src/core/`) is plain
filesystem + prompt text with zero framework dependencies. Three adapters
wire it into the harness's own hook/command mechanism — **OpenCode** (native
plugin), **Claude Code** (hooks + slash commands), and **Codex CLI**
(AGENTS.md + custom prompts). Same `.wikiskill/` storage, same
`skills/wikiskill/SKILL.md`, portable across all three.

Based on [WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution](https://arxiv.org/abs/2608.27454) (Tang et al., 2026, Google Research).

![WikiSkill Demo](https://github.com/ranjithrajv/opencode-wikiskill/raw/main/assets/wikiskill-demo.gif)

---

## What It Does

Your coding agent makes mistakes. WikiSkill remembers them — and turns them into better skills over time.

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

**Key insight from the paper:** Knowledge compounds. Even when a skill edit fails, the _lesson_ persists in the wiki so future iterations don't repeat the same mistake.

---

## Install

```sh
npm install --save-dev opencode-wikiskill
```

That's it for Claude Code and Codex CLI — a `postinstall` hook detects
whichever harness is already configured in your project (a `.claude/` dir,
an `AGENTS.md`) and finishes wiring it automatically: hooks, custom
commands/prompts, all of it. It never invents a harness config that wasn't
already there, so nothing happens on a project with none of these yet — for
that case, or to force a specific one, run:

```sh
npx wikiskill init --claude-code   # or --codex, --opencode, --all
```

OpenCode needs one manual step regardless (`opencode.jsonc` is JSONC —
comments included — so `init` checks it but won't auto-edit it): add
`"opencode-wikiskill"` to your plugins array —

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{ "package": "opencode-wikiskill", "options": { "sampleSize": 20, "maxIterations": 10 } }],
}
```

Re-running `npx wikiskill init` any time (or another `npm install`) is safe —
it only fills in what's missing.

| Harness | What `init` wires |
|---|---|
| **Claude Code** | `.claude/settings.json` `PostToolUse` hook (trace capture) + `.claude/commands/wiki-{evolve,status,reset}.md` |
| **Codex CLI** | `AGENTS.md` WikiSkill section (self-instrumented tracing) + `.codex/prompts/wiki-{evolve,status,reset}.md` |
| **OpenCode** | Checks `opencode.jsonc`/`.json` for the plugin entry, prints a reminder if missing |

Details per adapter: [`src/adapters/claude-code/README.md`](./src/adapters/claude-code/README.md), [`src/adapters/codex/README.md`](./src/adapters/codex/README.md).

---

## Quickstart

1. **Work normally** — traces are captured automatically (OpenCode, Claude Code) or self-logged per your AGENTS.md instructions (Codex).
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

| Command        | Description                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------- |
| `/wiki-evolve` | Run one evolution iteration: analyze traces → update wiki → propose skill → validate → gate |
| `/wiki-status` | Show evolution statistics, patterns, and logs                                               |
| `/wiki-reset`  | Reset evolution state (preserves wiki patterns)                                             |

---

## Configuration

| Option          | Type      | Default | Description                                          |
| --------------- | --------- | ------- | ---------------------------------------------------- |
| `sampleSize`    | `number`  | `20`    | Traces sampled per iteration for the Wiki Maintainer |
| `maxPatterns`   | `number`  | `100`   | Maximum patterns before pruning                      |
| `maxIterations` | `number`  | `10`    | Maximum evolution iterations before requiring reset  |
| `verbose`       | `boolean` | `false` | Enable verbose logging                               |

---

## How It Works

### Three-Layer Architecture

| Layer      | Directory                     | Purpose                                   | Mutability            |
| ---------- | ----------------------------- | ----------------------------------------- | --------------------- |
| **Raw**    | `.wikiskill/raw/`    | Execution traces from tool calls          | Immutable             |
| **Wiki**   | `.wikiskill/wiki/`   | Persistent patterns, logs, impact tracker | **Never rolled back** |
| **Skills** | `.wikiskill/skills/` | Evolved procedural instructions           | Updated with gating   |

### The Wiki Never Forgets

Even when a skill edit is rejected by the gating mechanism, the _knowledge_ of why it failed persists in the wiki. This is the core insight from the paper — knowledge compounds across iterations.

### Inference Agent ≠ Evolution Agent

During normal work, your agent only sees evolved **skills** — not the raw wiki. The wiki is reserved for the evolution process. This prevents the agent from "cheating" by reading its own analysis.

---

## RPC API

Other plugins and clients can interact with WikiSkill:

```ts
import { WikiSkill } from "opencode-wikiskill/rpc";

const wikiskill = client.rpc(WikiSkill);

// Get current status
const status = await wikiskill.status();
// { iteration: 3, bestScore: 0.82, evolving: false, patternCount: 7, traceCount: 45 }

// Trigger evolution
const result = await wikiskill.evolve({ sampleSize: 20 });

// List patterns
const { patterns } = await wikiskill.patterns();

// Subscribe to events
for await (const event of wikiskill.events.subscribe("evolution_completed")) {
  console.log(`Iteration ${event.data.iteration}: score=${event.data.score}`);
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

| Paper                   | Key Idea                                           | Link                                                                      |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| **EvoSkill**            | Self-evolving skill discovery via failure analysis | [arXiv:2603.02766](https://arxiv.org/abs/2603.02766)                      |
| **SkillOpt**            | Skill docs as trainable parameters                 | [arXiv:2605.23904](https://arxiv.org/abs/2605.23904)                      |
| **Trace2Skill**         | Parallel trajectory distillation into skills       | [arXiv:2603.25158](https://arxiv.org/abs/2603.25158)                      |
| **Karpathy's LLM Wiki** | Compounding knowledge concept (inspiration)        | [Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) |

---

## License

CC BY 4.0 (same as the paper)
