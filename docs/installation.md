# Installation

## npm (recommended)

```sh
npm install --save-dev wikiskill
```

Postinstall auto-detects your harness and wires it. No manual config needed.

## From source

```sh
git clone https://github.com/ranjithrajv/wikiskill.git
cd wikiskill
npm install
npm run build
```

## Verify

```sh
wikiskill --help
```

## Supported harnesses

| Harness | Detects | Wire |
|---------|---------|------|
| OpenCode | `opencode.jsonc` | Plugin API (hooks, commands, skills) |
| Claude Code | `.claude/` | PostToolUse hook + slash commands + skills |
| Codex CLI | `AGENTS.md` / `.codex/` | AGENTS.md section + custom prompts |
| Pi | `.pi/` | `.pi/wikiskill.md` + skills |
| Hermes | `hermes.yaml` / `.hermes/` | `SOUL.md` section + skills |

## Manual wiring

If auto-detection misses your harness, wire it explicitly:

```sh
wikiskill init --opencode      # or --claude-code, --codex, --pi, --hermes, --all
```

## Update

```sh
npm update wikiskill
```

Re-running install re-wires any newly detected harnesses.
