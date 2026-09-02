# WikiSkill — Claude Code Adapter

Claude Code has no plugin API — only hooks (shell commands) and slash commands
(markdown prompts). This adapter is a thin CLI (`wikiskill`) that shells the
harness-agnostic core (`src/core/*`) into those two mechanisms. Same wiki,
same evolution loop, same `skills/wikiskill/SKILL.md` as the OpenCode plugin —
different glue.

## Install

```sh
npm install --save-dev wikiskill
```

## Wire it up

1. **Trace capture** — merge `templates/settings.hooks.json` into your
   project's `.claude/settings.json` (or `.claude/settings.local.json`):

   ```json
   {
     "hooks": {
       "PostToolUse": [
         { "matcher": "*", "hooks": [{ "type": "command", "command": "npx wikiskill trace" }] }
       ]
     }
   }
   ```

2. **Slash commands** — copy `templates/commands/*.md` into your project's
   `.claude/commands/`. This gives you `/wiki-evolve`, `/wiki-status`,
   `/wiki-reset`, matching the OpenCode plugin's commands.

3. **Skill** — the shared `skills/wikiskill/SKILL.md` at the repo root works
   as-is; Claude Code loads project skills natively.

## What's different from the OpenCode adapter

|                                  | OpenCode                         | Claude Code                                                 |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Trace capture                    | `ctx.tool.hook("execute.after")` | `PostToolUse` hook → `wikiskill trace`                      |
| Commands                         | `ctx.command.transform()`        | `.claude/commands/*.md` → `wikiskill evolve-prompt`         |
| State                            | `ctx.storage`                    | `.wikiskill/state.json`                                     |
| Dispatching the evolution prompt | `ctx.session.prompt()`           | slash command prints it; Claude executes the steps directly |

Storage layout (`.wikiskill/{raw,wiki,skills}`) is identical either way — the
wiki and evolved skills are portable between harnesses.
