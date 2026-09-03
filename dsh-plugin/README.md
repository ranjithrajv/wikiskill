# wikiskill-dsh-plugin

WikiSkill for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`) — a Cordis plugin (`dsh-plugin` topic) that compiles agent experience
into persistent, evolving skills. Same `.wikiskill/` engine as the OpenCode /
Claude Code / Codex adapters; the plugin shells out to the `wikiskill` CLI so
there is one source of truth for the evolution logic.

> Verified against `deepseek-harness` v0.1.2-rc.1 (developer preview,
> 2026-08-30). dsh is pre-1.0 and warns of breaking changes — pin the harness
> version you deploy against.

## What it registers

| Surface | Name | Effect |
| ------- | ---- | ------ |
| Tool | `wiki_status` | `wikiskill status` — iteration, scores, patterns |
| Tool | `wiki_trace` | `wikiskill trace-manual` — log one execution |
| Tool | `wiki_evolve_prompt` | `wikiskill evolve-prompt` — start an evolution iteration |
| Command | `/wiki-status`, `/wiki-evolve`, `/wiki-reset` | Human slash-commands (only when the profile mounts `ctx.commands`) |

## Install

```sh
npm install -g wikiskill wikiskill-dsh-plugin
```

Mount it in your profile (any of `web`, `headless`, `sdk`, `acp`):

```sh
# append cordis.yml to your profile patch, then boot
dsh --profile headless --patch ./node_modules/wikiskill-dsh-plugin/cordis.yml "summarize this workspace"
```

`wiki_trace` after non-trivial tool calls is how traces accumulate; `/wiki-evolve`
(or the `wiki_evolve_prompt` tool) runs the Algorithm 1 loop.

## Known Limitations and Deferred Work

- **No in-process core** — the plugin shells out to the CLI; a sandbox profile
  that blocks subprocess spawn breaks it.
- **Headless `validate` gate** — the dsh headless runner (`src/adapters/deepseek/runner.ts`)
  is still a stub; use `--harness claude-code` until a `dsh --profile headless`
  runner is implemented against the SDK client.
