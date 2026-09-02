# WikiSkill — Codex CLI Adapter

Codex CLI has no plugin API and no per-tool-call hook (its `notify` hook only
fires on turn completion) — its automation surface is `AGENTS.md` (persistent
instructions, layered from `~/.codex/` down to the project) and custom
prompts under `.codex/prompts/`. This adapter wires WikiSkill's core into
those two mechanisms and reuses the same `wikiskill` CLI as the Claude Code
adapter.

## Install

```sh
npm install --save-dev opencode-wikiskill
```

## Wire it up

1. **Trace capture (self-instrumented)** — append
   `templates/AGENTS.wikiskill.md` to your project's `AGENTS.md`. Since Codex
   has no tool-call hook, the agent logs its own traces via
   `npx wikiskill trace-manual --tool <name> --status completed|error`
   instead of a framework firing a hook automatically.

2. **Custom prompts** — copy `templates/prompts/*.md` into your project's
   `.codex/prompts/`, giving you `/wiki-evolve`, `/wiki-status`, `/wiki-reset`
   in the Codex TUI.

3. **Skill** — the shared `skills/wikiskill/SKILL.md` at the repo root works
   as-is; Codex CLI loads Skills the same way Claude Code and OpenCode do.

## What's different from the other adapters

|               | OpenCode                         | Claude Code                            | Codex CLI                                                  |
| ------------- | -------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Trace capture | `ctx.tool.hook("execute.after")` | `PostToolUse` hook → `wikiskill trace` | self-instrumented via AGENTS.md → `wikiskill trace-manual` |
| Commands      | `ctx.command.transform()`        | `.claude/commands/*.md`                | `.codex/prompts/*.md`                                      |
| State         | `ctx.storage`                    | `.wikiskill/state.json`                | `.wikiskill/state.json`                                    |

Because Codex has no live hook, its Raw layer is lower-fidelity than the
other two adapters — it only captures what the agent chooses to log. Storage
layout (`.wikiskill/{raw,wiki,skills}`) is otherwise identical, so wikis and
evolved skills are portable across all three harnesses.
