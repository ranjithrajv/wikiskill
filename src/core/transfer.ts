// ─── Transfer: move skills across workspaces/models ───────────────────────────
// Skills evolved in one workspace can be transferred to another — same SKILL.md
// format makes them portable.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface TransferOptions {
  /** Only transfer skills that passed gating (validated). */
  validatedOnly?: boolean;
  /** Overwrite existing skills in target. */
  overwrite?: boolean;
}

export interface TransferResult {
  transferred: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Transfer skills from source workspace to target workspace.
 * Skills are copied as-is (same SKILL.md format across all harnesses).
 */
export async function transferSkills(
  sourceSkillsDir: string,
  targetSkillsDir: string,
  options: TransferOptions = {},
): Promise<TransferResult> {
  const result: TransferResult = { transferred: [], skipped: [], errors: [] };

  if (!existsSync(sourceSkillsDir)) {
    result.errors.push(`Source skills dir not found: ${sourceSkillsDir}`);
    return result;
  }

  await fs.mkdir(targetSkillsDir, { recursive: true });

  const files = await fs.readdir(sourceSkillsDir);
  const skillFiles = files.filter((f) => f.endsWith(".md"));

  for (const file of skillFiles) {
    const sourcePath = path.join(sourceSkillsDir, file);
    const targetPath = path.join(targetSkillsDir, file);

    try {
      if (existsSync(targetPath) && !options.overwrite) {
        result.skipped.push(file);
        continue;
      }

      const content = await fs.readFile(sourcePath, "utf-8");
      await fs.writeFile(targetPath, content, "utf-8");
      result.transferred.push(file);
    } catch (err) {
      result.errors.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Find the best validated skill set from a workspace's evolution history.
 * Returns the skills from the iteration with the highest validation score.
 */
export async function findBestValidatedSkills(
  impactHistory: Array<{
    iteration: number;
    validationScore: number;
    outcome: "accepted" | "rejected";
    targetSkill: string;
  }>,
  activeSkillsDir: string,
): Promise<{ iteration: number; score: number; skills: string[] } | null> {
  const accepted = impactHistory.filter((h) => h.outcome === "accepted");
  if (accepted.length === 0) return null;

  // Find the highest scoring accepted iteration
  const best = accepted.reduce((a, b) => (b.validationScore > a.validationScore ? b : a));

  // List current active skills
  const skills = existsSync(activeSkillsDir)
    ? (await fs.readdir(activeSkillsDir)).filter((f) => f.endsWith(".md"))
    : [];

  return { iteration: best.iteration, score: best.validationScore, skills };
}

/** Format transfer result as human-readable text. */
export function formatTransferResult(result: TransferResult): string {
  const lines = [
    "## Skill Transfer Results",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Transferred | ${result.transferred.length} |`,
    `| Skipped | ${result.skipped.length} |`,
    `| Errors | ${result.errors.length} |`,
  ];

  if (result.transferred.length > 0) {
    lines.push("", "### Transferred", ...result.transferred.map((s) => `- ✅ ${s}`));
  }
  if (result.skipped.length > 0) {
    lines.push("", "### Skipped (already exist)", ...result.skipped.map((s) => `- ⏭️ ${s}`));
  }
  if (result.errors.length > 0) {
    lines.push("", "### Errors", ...result.errors.map((e) => `- ❌ ${e}`));
  }

  return lines.join("\n");
}
