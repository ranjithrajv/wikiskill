# WikiSkill — Hermes Adapter

Hermes uses `SOUL.md` for personality/instructions and has a built-in skills
system. This adapter appends a WikiSkill section to `SOUL.md` and installs
Hermes skills at `.hermes/skills/wikiskill/`.

## Install

```sh
npm install --save-dev wikiskill
```

## Wire it up

Run `npx wikiskill init --hermes` (or just `npx wikiskill init` if `SOUL.md`
or `.hermes/` already exists in your project). This:

1. Appends WikiSkill instructions to `SOUL.md`
2. Installs skills at `.hermes/skills/wikiskill/`

## What's different from the OpenCode adapter

|                                  | OpenCode                         | Hermes                                              |
| -------------------------------- | -------------------------------- | --------------------------------------------------- |
| Trace capture                    | `ctx.tool.hook("execute.after")` | self-instrumented via `SOUL.md`                     |
| Commands                         | `ctx.command.transform()`        | `.hermes/skills/wikiskill/*.md`                     |
| State                            | `ctx.storage`                    | `.wikiskill/state.json`                             |
| Dispatching the evolution prompt | `ctx.session.prompt()`           | skill prints it; Hermes executes the steps directly |

Storage layout (`.wikiskill/{raw,wiki,skills}`) is identical — the wiki and
evolved skills are portable between harnesses.
