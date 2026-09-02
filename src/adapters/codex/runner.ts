// ─── Codex CLI Headless Runner (not yet implemented) ──────────────────────────
// `codex exec` genuinely supports headless single-shot runs, but this adapter
// hasn't verified Codex's project-scoped skill-loading path the way the
// Claude Code runner has (against a live `.claude/skills/<id>/SKILL.md`
// install) — shipping a guess here would silently make `validate` measure
// nothing real. Throwing beats fabricating a result.

import type { HeadlessRunner } from "../../core/runner.js";

export const codexRunner: HeadlessRunner = {
  harness: "codex",
  async installSkill() {
    throw new Error(
      "[wikiskill] Codex CLI headless runner not implemented yet — its project-scoped skill path hasn't been verified. Use --harness claude-code, or contribute this runner.",
    );
  },
  async run() {
    throw new Error("[wikiskill] Codex CLI headless runner not implemented yet.");
  },
};
