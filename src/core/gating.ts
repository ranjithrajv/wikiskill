// ─── Gating & Rollback ─────────────────────────────────────────────────────────
// Validates proposed skill changes against a validation set and accepts
// or rolls back based on performance.
//
// From the paper (§3.2.4):
//   "If the validation score improves, accept the candidate skills.
//    Otherwise, discard the candidate and revert.
//    The wiki is NEVER rolled back."
//
// In our OpenCode implementation, we use a simplified scoring approach:
// - The validation prompt asks the LLM to evaluate the proposed skill
//   against known success/failure patterns from the wiki
// - This provides a heuristic quality signal without needing a formal
//   evaluation harness

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SkillImpactRecord, PluginState } from "./types.js";
import { listBenchTasks, makeTaskWorkDir, runVerify } from "./bench.js";
import type { HeadlessRunner } from "./runner.js";

/** Build a validation prompt for the gating mechanism. */
export function buildValidationPrompt(
  proposedSkillContent: string,
  wikiPatterns: string,
  currentBestScore: number,
  iteration: number,
): string {
  return `## Skill Validation — Iteration ${iteration}

You are the gating mechanism for WikiSkill. Evaluate whether the proposed skill improvement should be accepted.

### Proposed Skill
\`\`\`markdown
${proposedSkillContent}
\`\`\`

### Wiki Patterns (Context)
${wikiPatterns || "_No patterns available._"}

### Current Best Score: ${currentBestScore.toFixed(2)}

### Evaluation Criteria
Score the proposed skill on these dimensions (0.0 - 1.0 each):

1. **Correctness**: Does the skill address a real, documented failure pattern?
2. **Actionability**: Are the instructions concrete enough for an agent to follow?
3. **Completeness**: Does it cover the full workflow, not just a partial fix?
4. **Non-redundancy**: Does it add value beyond what existing skills already cover?

### Output Format
Output your evaluation in this exact format:

\`\`\`wikiskill-gating
correctness: <0.0-1.0>
actionability: <0.0-1.0>
completeness: <0.0-1.0>
non-redundancy: <0.0-1.0>
overall: <weighted average, 0.0-1.0>
recommendation: accept | reject
reasoning: <brief explanation>
\`\`\``;
}

/** Parse the gating result from the LLM's evaluation output. */
export function parseGatingResult(output: string): {
  correctness: number;
  actionability: number;
  completeness: number;
  nonRedundancy: number;
  overall: number;
  recommendation: "accept" | "reject";
  reasoning: string;
} | null {
  const match = output.match(/```wikiskill-gating\s*\n([\s\S]*?)\n```/);
  if (!match) return null;

  const body = match[1];
  const get = (key: string): number => {
    const m = body.match(new RegExp(`${key}:\\s*([\\d.]+)`, "i"));
    return m ? parseFloat(m[1]) : 0;
  };

  return {
    correctness: get("correctness"),
    actionability: get("actionability"),
    completeness: get("completeness"),
    nonRedundancy: get("non-redundancy"),
    overall: get("overall"),
    recommendation: body.includes("recommendation: accept") ? "accept" : "reject",
    reasoning: body.match(/reasoning:\s*(.+)/i)?.[1]?.trim() ?? "",
  };
}

/**
 * Decide whether to accept or reject a skill proposal.
 *
 * Returns true if the proposal should be accepted (score > bestScore).
 */
export function shouldAccept(validationScore: number, bestScore: number): boolean {
  return validationScore > bestScore;
}

/**
 * Record the outcome of a gating decision.
 */
export async function recordOutcome(
  state: PluginState,
  record: SkillImpactRecord,
): Promise<PluginState> {
  const newState = { ...state };
  if (record.outcome === "accepted") {
    newState.bestScore = record.validationScore;
  }
  newState.impactHistory = [...newState.impactHistory, record];
  return newState;
}

/**
 * Build a skill impact record from gating results.
 */
export function buildImpactRecord(
  iteration: number,
  targetSkill: string,
  validationScore: number,
  bestScore: number,
  accepted: boolean,
  proposalSummary: string,
  diff?: string,
): SkillImpactRecord {
  return {
    iteration,
    timestamp: Date.now(),
    targetSkill,
    proposalSummary,
    validationScore,
    bestScore,
    outcome: accepted ? "accepted" : "rejected",
    diff,
  };
}

/**
 * Rollback a rejected skill proposal. If the proposal was an edit, restore
 * the `.bak` the proposer left behind; if it was a brand-new skill (no
 * backup exists), discard the file entirely. Either way the wiki itself is
 * never touched — only the skills/ directory.
 */
export async function rollbackSkill(skillsDir: string, skillId: string): Promise<boolean> {
  const backupFile = path.join(skillsDir, `${skillId}.md.bak`);
  const targetFile = path.join(skillsDir, `${skillId}.md`);
  try {
    const backupContent = await fs.readFile(backupFile, "utf-8");
    await fs.writeFile(targetFile, backupContent, "utf-8");
    await fs.unlink(backupFile);
    return true;
  } catch {
    try {
      await fs.unlink(targetFile);
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Real held-out validation ───────────────────────────────────────────────────
// Replaces self-reported scoring with an actual measurement: run every
// configured bench task with the candidate skill(s) installed, headlessly,
// in an isolated work dir, and score by the fraction that pass their own
// verify script. Gate is exactly the paper's: accept iff R_val > R_best.

export interface TaskResult {
  id: string;
  pass: boolean;
  output: string;
}

export interface ValidationGateResult {
  /** false when no bench tasks are configured — nothing was measured or gated. */
  ranBench: boolean;
  total: number;
  passed: number;
  /** Pass rate over the tasks actually run (R_val). 0 when ranBench is false. */
  score: number;
  bestScore: number;
  accepted: boolean;
  taskResults: TaskResult[];
}

export async function runValidationGate(
  projectDir: string,
  candidateSkills: Array<{ id: string; content: string }>,
  runner: HeadlessRunner,
  bestScore: number,
  opts: { timeoutMs?: number; limit?: number } = {},
): Promise<ValidationGateResult> {
  const allTasks = await listBenchTasks(projectDir);
  if (allTasks.length === 0) {
    return {
      ranBench: false,
      total: 0,
      passed: 0,
      score: 0,
      bestScore,
      accepted: false,
      taskResults: [],
    };
  }
  const tasks = opts.limit ? allTasks.slice(0, opts.limit) : allTasks;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  const taskResults: TaskResult[] = [];
  for (const task of tasks) {
    const workDir = await makeTaskWorkDir(task.id);
    try {
      if (task.fixtureDir) {
        await fs.cp(task.fixtureDir, workDir, { recursive: true });
      }
      for (const skill of candidateSkills) {
        await runner.installSkill(workDir, skill.id, skill.content);
      }
      const run = await runner.run(task.prompt, workDir, timeoutMs);
      const pass = run.ok && (await runVerify(task.verifyPath, workDir, timeoutMs));
      taskResults.push({ id: task.id, pass, output: run.output });
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  const passed = taskResults.filter((r) => r.pass).length;
  const score = passed / taskResults.length;
  return {
    ranBench: true,
    total: taskResults.length,
    passed,
    score,
    bestScore,
    accepted: shouldAccept(score, bestScore),
    taskResults,
  };
}
