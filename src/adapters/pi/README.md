# WikiSkill — Pi Adapter

Pi uses a `.pi/` directory for project config and a skill mechanism. This
adapter writes a `.pi/wikiskill.md` instructions file that Pi loads as project
context, plus installs Pi skills at `.pi/skills/wikiskill/`.

## Install

```sh
npm install --save-dev wikiskill
```

## Wire it up

Run `npx wikiskill init --pi` (or just `npx wikiskill init` if `.pi/` already
exists in your project). This:

1. Writes `.pi/wikiskill.md` with trace/evolve instructions
2. Installs skills at `.pi/skills/wikiskill/`

## What's different from the OpenCode adapter

|                                  | OpenCode                         | Pi                                              |
| -------------------------------- | -------------------------------- | ----------------------------------------------- |
| Trace capture                    | `ctx.tool.hook("execute.after")` | self-instrumented via `.pi/wikiskill.md`        |
| Commands                         | `ctx.command.transform()`        | `.pi/skills/wikiskill/*.md`                     |
| State                            | `ctx.storage`                    | `.wikiskill/state.json`                         |
| Dispatching the evolution prompt | `ctx.session.prompt()`           | skill prints it; Pi executes the steps directly |

Storage layout (`.wikiskill/{raw,wiki,skills}`) is identical — the wiki and
evolved skills are portable between harnesses.
