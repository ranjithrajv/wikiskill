// ─── OpenCode Headless Runner (not yet implemented) ───────────────────────────
// `opencode run --dir <dir>` supports headless single-shot runs, but the
// OpenCode plugin registers evolved skills through `ctx.skill.transform()`
// (a live plugin API call) rather than a filesystem convention — there is
// no verified "just drop a file here" path to install a candidate skill
// into an isolated bench work dir the way Claude Code's `.claude/skills/`
// works. Throwing beats fabricating a result.

import type { HeadlessRunner } from "../../core/runner.js";

export const openCodeRunner: HeadlessRunner = {
  harness: "opencode",
  async installSkill() {
    throw new Error(
      "[wikiskill] OpenCode headless runner not implemented yet — evolved skills are registered via ctx.skill.transform(), not a filesystem convention, so there's no verified way to install a candidate skill outside a running plugin instance. Use --harness claude-code, or contribute this runner.",
    );
  },
  async run() {
    throw new Error("[wikiskill] OpenCode headless runner not implemented yet.");
  },
};
