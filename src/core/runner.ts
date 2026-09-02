// ─── Headless Runner ───────────────────────────────────────────────────────────
// The interface a harness adapter implements so the validation gate can
// invoke it non-interactively against held-out bench tasks. Core stays
// harness-agnostic — it only ever talks to this interface, never to a
// specific CLI binary.

import type { Harness } from "./init.js";

export interface HeadlessRunResult {
  /** Did the harness process itself exit cleanly (not: did the task pass). */
  ok: boolean;
  /** Combined, truncated stdout/stderr — kept for the impact log, not parsed. */
  output: string;
}

export interface HeadlessRunner {
  harness: Harness;
  /** Materialize one candidate skill wherever this harness loads project skills from. */
  installSkill(workDir: string, skillId: string, content: string): Promise<void>;
  /** Run the harness non-interactively on `prompt` with cwd=workDir, bounded by timeoutMs. */
  run(prompt: string, workDir: string, timeoutMs: number): Promise<HeadlessRunResult>;
}
