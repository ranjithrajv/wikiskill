// ─── Storage Paths ─────────────────────────────────────────────────────────────
// Single source of truth for where WikiSkill stores its state on disk.
// Harness-neutral: `.wikiskill/` at the project root, not nested under any
// one host tool's dotfolder.

import * as path from "node:path";

/** Root directory for all WikiSkill state in a project. */
export function wikiSkillRoot(projectDir: string): string {
  return path.join(projectDir, ".wikiskill");
}

/** Wiki layer: persistent, compounding knowledge (patterns, logs, impact tracker). */
export function wikiRoot(projectDir: string): string {
  return path.join(wikiSkillRoot(projectDir), "wiki");
}

/** Raw layer: immutable execution traces. */
export function tracesRoot(projectDir: string): string {
  return path.join(wikiSkillRoot(projectDir), "raw");
}

/** Skills layer: evolved procedural skills, updated with gating. */
export function skillsRoot(projectDir: string): string {
  return path.join(wikiSkillRoot(projectDir), "skills");
}
