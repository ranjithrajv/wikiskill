# DeepSeek adapter

File-configured adapter (same shape as Codex/Pi/Hermes — no verified
plugin API or hook system assumed).

- `wireDeepseek()` appends a `## WikiSkill` section to `DEEPSEEK.md`
  (self-instrumented tracing via `npx wikiskill trace-manual`) and writes
  file prompts to `.deepseek/prompts/wiki-{evolve,status,reset}.md`.
- Detection: `.deepseek/` dir or `DEEPSEEK.md` in the project root.
- CLI binary probed on `$PATH`: `deepseek`.
- `npx wikiskill init --deepseek` forces wiring on a fresh project.
- Skills are read as plain files from `.wikiskill/skills/` (Codex-style).
- Headless `validate` runner (`src/adapters/deepseek/runner.ts`) is a
  stub that throws — same policy as the Codex/OpenCode runners: no
  verified project-scoped skill-loading path, so no fabricated results.
