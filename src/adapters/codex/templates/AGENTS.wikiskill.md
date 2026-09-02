<!--
  Append this block to your project's AGENTS.md. Codex CLI has no per-tool-call
  hook API (its `notify` hook only fires on turn completion), so trace capture
  is self-instrumented: the agent logs its own tool calls instead of a
  framework doing it for you.
-->

## WikiSkill

This project uses WikiSkill for persistent, evolving skills at `.wikiskill/`.

- After any non-trivial tool call (edit, command, search that changes your
  plan), log it:
  `npx wikiskill trace-manual --tool <name> --status completed|error`
  (add `--input '<json>'` / `--result '<json>'` when it's worth capturing).
- Before starting work, check `.wikiskill/skills/` for relevant evolved
  skills and follow them.
- Run `npx wikiskill status` to see current patterns and evolution state.
- Run `npx wikiskill evolve-prompt` to start a WikiSkill evolution iteration,
  then execute the printed steps and finish with `npx wikiskill evolve-complete`.
