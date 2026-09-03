// ─── DeepSeek Headless Runner (not yet implemented) ──────────────────────────
// DeepSeek exposes an OpenAI-compatible API rather than a verified
// project-scoped skill-loading convention, so like the Codex/OpenCode
// runners we throw a clear error instead of silently measuring nothing.

import type { HeadlessRunner } from "../../core/runner.js";

export const deepseekRunner: HeadlessRunner = {
  harness: "deepseek",
  async installSkill() {
    throw new Error(
      "[wikiskill] DeepSeek headless runner not implemented yet — no verified project-scoped skill path. Use --harness claude-code, or contribute this runner.",
    );
  },
  async run() {
    throw new Error("[wikiskill] DeepSeek headless runner not implemented yet.");
  },
};
