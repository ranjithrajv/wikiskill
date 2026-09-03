# WikiSkill — Pi Adapter

Checked against a live `pi` install (`pi --help`, `~/.pi/agent/skills/`):

- **Skill format is confirmed** — `<skills-dir>/<name>/SKILL.md` with
  frontmatter, the same shape Claude Code uses. `~/.pi/agent/skills/<name>/SKILL.md`
  exists on disk here.
- **Project-level skill path is NOT confirmed.** This adapter mirrors the
  user-level path as `.pi/agent/skills/` by analogy, but a real project
  found on this machine used a different `.pi/<session-name>/SYSTEM.md`
  layout instead — so treat auto-discovery as best-effort, not guaranteed.
- **There's no evidence Pi auto-loads a project instructions file** the way
  `AGENTS.md`/`CLAUDE.md` work — nothing in `--help` scans a directory for
  one. The one confirmed mechanism is an explicit `--append-system-prompt
<text-or-file>` CLI flag, so that's what actually delivers instructions
  here (see below), not passive discovery of `.pi/wikiskill.md`.

## Install

```sh
npm install --save-dev wikiskill
```

## Wire it up

Run `npx wikiskill init --pi` (or just `npx wikiskill init` if `.pi/` already
exists in your project). This:

1. Writes `.pi/wikiskill.md` with trace/evolve instructions (not auto-loaded —
   see above)
2. Syncs skills to `.pi/agent/skills/` (best-effort path)

Then use `npx wikiskill open pi` rather than running `pi` directly — it
appends `--append-system-prompt .pi/wikiskill.md` automatically, which is
the one confirmed way the instructions actually reach the model.

## What's different from the OpenCode adapter

|                                  | OpenCode                         | Pi                                                             |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| Trace capture                    | `ctx.tool.hook("execute.after")` | self-instrumented per `.pi/wikiskill.md`                       |
| Commands                         | `ctx.command.transform()`        | none — no confirmed prompt/command convention for Pi           |
| Skills                           | `ctx.skill.transform()`          | synced to `.pi/agent/skills/` (unconfirmed project-level path) |
| State                            | `ctx.storage`                    | `.wikiskill/state.json`                                        |
| Dispatching the evolution prompt | `ctx.session.prompt()`           | `wikiskill open pi` passes it via `--append-system-prompt`     |

Storage layout (`.wikiskill/{raw,wiki,skills}`) is identical to the other
adapters. Loading isn't — this one is the least verified of the five.
