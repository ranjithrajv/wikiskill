# Three-Layer Architecture

WikiSkill organizes the workspace into three distinct layers, mirroring the paper's design (§3.1).

```
┌─────────────────────────────────────────────────────────────┐
│                     Skills Layer                            │
│  skills/active/*.md — evolved procedural knowledge         │
│  Updated only when validation improves (gated)              │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ distilled from
┌─────────────────────────────────────────────────────────────┐
│                      Wiki Layer                             │
│  wiki/patterns/*.md — failure modes & success strategies    │
│  wiki/index.md — pattern catalog                           │
│  wiki/logs.md — evolution history                          │
│  wiki/skill-impact.md — proposal outcomes                  │
│  NEVER rolled back — knowledge compounds forever            │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ distilled from
┌─────────────────────────────────────────────────────────────┐
│                      Raw Layer                              │
│  raw/traces/ — immutable execution traces                  │
│  Append-only, never modified                               │
└─────────────────────────────────────────────────────────────┘
```

## Raw Layer (`raw/`)

Immutable execution traces from every tool call. Captured automatically:
- OpenCode: via `tool.hook("execute.after")` plugin hook
- Claude Code: via `PostToolUse` hook → `wikiskill trace`
- Others: self-instrumented via AGENTS.md instructions

Each trace records: tool name, input, output, status (completed/error), duration.

## Wiki Layer (`wiki/`)

Persistent, compounding knowledge maintained by the Wiki Maintainer agent:
- **`patterns/*.md`** — individual pattern pages (failure modes, success strategies)
- **`index.md`** — auto-rebuilt catalog of all patterns
- **`logs.md`** — chronological evolution log
- **`skill-impact.md`** — acceptance/rejection history for all proposals

The wiki is **never rolled back** — even when a skill edit is rejected, the knowledge of why it failed persists.

## Skills Layer (`skills/`)

Evolved procedural instructions that the agent actually follows:
- **`active/`** — the current skill set (what the agent sees)
- **`framework/`** — maintainer + proposer prompt templates

Skills are the *distilled output* of the wiki — concise, actionable, validated.

## Why three layers?

The key insight from the paper: separating **knowledge** (wiki) from **procedure** (skills) lets knowledge compound while skills stay lean. Without the wiki, skill edits are guesses. With the wiki, every edit is grounded in evidence.
