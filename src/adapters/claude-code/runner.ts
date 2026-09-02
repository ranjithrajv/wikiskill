// ─── Claude Code Headless Runner ───────────────────────────────────────────────
// Runs `claude -p` non-interactively against an isolated bench work dir, with
// the candidate skill installed at the real project-skill path Claude Code
// actually loads from (.claude/skills/<id>/SKILL.md — confirmed against a
// live install; NOT the bare top-level skills/ this repo's own SKILL.md
// currently sits at, which Claude Code does not auto-discover).
//
// --permission-mode acceptEdits auto-accepts file edits but still blocks on
// riskier tool calls (arbitrary shell, etc.) rather than bypassing them —
// with no TTY to approve from, a task that needs one just times out instead
// of running unsandboxed. Bench tasks are configured by the project's own
// maintainer, so this is a self-inflicted trust boundary, not an untrusted one.

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { HeadlessRunner, HeadlessRunResult } from "../../core/runner.js";

const OUTPUT_TAIL = 4000;

export const claudeCodeRunner: HeadlessRunner = {
  harness: "claude-code",

  async installSkill(workDir, skillId, content) {
    const dir = path.join(workDir, ".claude", "skills", skillId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), content, "utf-8");
  },

  run(prompt, workDir, timeoutMs): Promise<HeadlessRunResult> {
    return new Promise((resolve) => {
      const child = spawn("claude", ["-p", prompt, "--permission-mode", "acceptEdits"], {
        cwd: workDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve({ ok: false, output: output.slice(-OUTPUT_TAIL) + "\n[wikiskill] timed out" });
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, output: output.slice(-OUTPUT_TAIL) });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ ok: false, output: String(err) });
      });
    });
  },
};
