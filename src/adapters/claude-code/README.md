# WikiSkill — Claude Code Adapter

Claude Code has no plugin API — only hooks (shell commands) and slash commands
(markdown prompts). This adapter is a thin CLI (`wikiskill`) that shells the
harness-agnostic core (`src/core/*`) into those two mechanisms. Same wiki,
same evolution loop as the OpenCode plugin — different glue, and skills get
synced to Claude Code's own `.claude/skills/` convention rather than shared
verbatim (see below).

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

3. **Skills** — Claude Code loads project skills from `.claude/skills/<id>/SKILL.md`,
   not a bare top-level `skills/` directory. `wikiskill init` / `wikiskill open` /
   a successful `wikiskill validate` sync the framework skill and every accepted
   evolved skill there automatically — you don't need to copy anything by hand.

## What's different from the OpenCode adapter

|                                  | OpenCode                         | Claude Code                                                 |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| Trace capture                    | `ctx.tool.hook("execute.after")` | `PostToolUse` hook → `wikiskill trace`                      |
| Commands                         | `ctx.command.transform()`        | `.claude/commands/*.md` → `wikiskill evolve-prompt`         |
| State                            | `ctx.storage`                    | `.wikiskill/state.json`                                     |
| Dispatching the evolution prompt | `ctx.session.prompt()`           | slash command prints it; Claude executes the steps directly |

Storage layout (`.wikiskill/{raw,wiki,skills}`) is identical either way — the
wiki and evolved skills are portable between harnesses.
