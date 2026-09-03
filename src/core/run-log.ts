// — Run Logger: documents evolution runs with honest results —
// Each run produces a structured log that can be exported to docs/runs.md

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface RunPattern {
  id: string;
  title: string;
  category: "failure" | "success" | "strategy";
}

export interface RunIteration {
  iteration: number;
  inference: {
    total: number;
    success: number;
    fail: number;
    score: number;
  };
  maintainer: {
    patternsCreated: number;
    patternsUpdated: number;
    newPatterns: RunPattern[];
  };
  proposer: {
    action: "create" | "edit" | "no_action";
    target: string;
    proposalSummary: string;
  };
  gating: {
    validated: boolean;
    rVal: number;
    rBest: number;
    outcome: "accepted" | "rejected" | "skipped";
  };
}

export interface RunLog {
  id: string;
  date: string;
  model: string;
  backend: string;
  workspace: string;
  iterations: RunIteration[];
  cost: {
    estimatedUsd: number;
    tokensIn: number;
    tokensOut: number;
  };
  summary: {
    totalIterations: number;
    skillsAccepted: number;
    skillsRejected: number;
    finalRBest: number;
    activeSkills: string[];
    wikiPatterns: number;
  };
  patterns: RunPattern[];
  honestNegatives: string[];
}

const RUNS_DIR = ".wikiskill/runs";

/** Initialize run logging for a workspace. */
export async function initRunLog(
  projectDir: string,
  metadata: {
    model: string;
    backend: string;
    workspace: string;
  },
): Promise<string> {
  const runsDir = path.join(projectDir, RUNS_DIR);
  await fs.mkdir(runsDir, { recursive: true });

  const runId = `run-${Date.now()}`;
  const runLog: RunLog = {
    id: runId,
    date: new Date().toISOString().split("T")[0],
    model: metadata.model,
    backend: metadata.backend,
    workspace: metadata.workspace,
    iterations: [],
    cost: { estimatedUsd: 0, tokensIn: 0, tokensOut: 0 },
    summary: {
      totalIterations: 0,
      skillsAccepted: 0,
      skillsRejected: 0,
      finalRBest: 0,
      activeSkills: [],
      wikiPatterns: 0,
    },
    patterns: [],
    honestNegatives: [],
  };

  await saveRunLog(projectDir, runLog);
  return runId;
}

/** Load the current run log. */
export async function loadRunLog(projectDir: string): Promise<RunLog | null> {
  try {
    const runsDir = path.join(projectDir, RUNS_DIR);
    const files = await fs.readdir(runsDir);
    if (files.length === 0) return null;

    // Get most recent run
    const sorted = files
      .filter((f) => f.endsWith(".json"))
      .sort()
      .reverse();
    const latest = sorted[0];
    const raw = await fs.readFile(path.join(runsDir, latest), "utf-8");
    return JSON.parse(raw) as RunLog;
  } catch {
    return null;
  }
}

/** Save run log to disk. */
export async function saveRunLog(projectDir: string, runLog: RunLog): Promise<void> {
  const runsDir = path.join(projectDir, RUNS_DIR);
  await fs.mkdir(runsDir, { recursive: true });
  const filePath = path.join(runsDir, `${runLog.id}.json`);
  await fs.writeFile(filePath, JSON.stringify(runLog, null, 2), "utf-8");
}

/** Add an iteration to the run log. */
export async function logIteration(projectDir: string, iteration: RunIteration): Promise<void> {
  const runLog = await loadRunLog(projectDir);
  if (!runLog) return;

  runLog.iterations.push(iteration);
  runLog.summary.totalIterations = runLog.iterations.length;

  if (iteration.gating.outcome === "accepted") {
    runLog.summary.skillsAccepted++;
    if (iteration.proposer.target) {
      runLog.summary.activeSkills.push(iteration.proposer.target);
    }
  } else if (iteration.gating.outcome === "rejected") {
    runLog.summary.skillsRejected++;
  }

  runLog.summary.finalRBest = iteration.gating.rBest;
  runLog.summary.wikiPatterns += iteration.maintainer.patternsCreated;

  await saveRunLog(projectDir, runLog);
}

/** Add an honest negative observation. */
export async function logNegative(projectDir: string, observation: string): Promise<void> {
  const runLog = await loadRunLog(projectDir);
  if (!runLog) return;

  runLog.honestNegatives.push(observation);
  await saveRunLog(projectDir, runLog);
}

/** Export run log as Markdown for docs/runs.md. */
export function formatRunLogMarkdown(runLog: RunLog): string {
  const lines: string[] = [];

  lines.push(`## Run: ${runLog.workspace} (${runLog.backend}, ${runLog.model})`);
  lines.push("");
  lines.push(`> **Date:** ${runLog.date}`);
  lines.push(`> **Model:** ${runLog.model}`);
  lines.push(`> **Backend:** ${runLog.backend}`);
  lines.push(`> **Iterations:** ${runLog.summary.totalIterations}`);
  lines.push(`> **Cost:** $${runLog.cost.estimatedUsd.toFixed(2)}`);
  lines.push("");

  // Iteration table
  lines.push("### Results");
  lines.push("");
  lines.push("| Iter | Proposal | R_val | R_best | Outcome |");
  lines.push("|------|----------|-------|--------|---------|");

  for (const iter of runLog.iterations) {
    const proposal =
      iter.proposer.action === "no_action"
        ? "No action"
        : `${iter.proposer.target} (${iter.proposer.action})`;
    const rVal = iter.gating.validated ? iter.gating.rVal.toFixed(3) : "—";
    const outcome =
      iter.gating.outcome === "accepted"
        ? "**ACCEPTED** ✓"
        : iter.gating.outcome === "rejected"
          ? "**REJECTED** ✗"
          : "—";

    lines.push(
      `| ${iter.iteration} | ${proposal} | ${rVal} | ${iter.gating.rBest.toFixed(3)} | ${outcome} |`,
    );
  }

  lines.push("");

  // Patterns
  if (runLog.patterns.length > 0) {
    lines.push("### Patterns discovered");
    lines.push("");
    for (const p of runLog.patterns) {
      lines.push(`- **${p.id}** (${p.category}): ${p.title}`);
    }
    lines.push("");
  }

  // Honest negatives
  if (runLog.honestNegatives.length > 0) {
    lines.push("### Honest negatives");
    lines.push("");
    for (const neg of runLog.honestNegatives) {
      lines.push(`- ${neg}`);
    }
    lines.push("");
  }

  // Summary
  lines.push("### Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Iterations run | ${runLog.summary.totalIterations} |`);
  lines.push(`| Skills accepted | ${runLog.summary.skillsAccepted} |`);
  lines.push(`| Skills rejected | ${runLog.summary.skillsRejected} |`);
  lines.push(`| Final R_best | ${runLog.summary.finalRBest.toFixed(3)} |`);
  lines.push(`| Active skills | ${runLog.summary.activeSkills.join(", ") || "none"} |`);
  lines.push(`| Wiki patterns | ${runLog.summary.wikiPatterns} |`);
  lines.push(`| Cost | $${runLog.cost.estimatedUsd.toFixed(2)} |`);
  lines.push("");

  return lines.join("\n");
}

/** List all run logs for a project. */
export async function listRunLogs(projectDir: string): Promise<RunLog[]> {
  try {
    const runsDir = path.join(projectDir, RUNS_DIR);
    const files = await fs.readdir(runsDir);
    const runs: RunLog[] = [];

    for (const file of files.filter((f) => f.endsWith(".json"))) {
      const raw = await fs.readFile(path.join(runsDir, file), "utf-8");
      runs.push(JSON.parse(raw) as RunLog);
    }

    return runs.sort((a, b) => b.id.localeCompare(a.id));
  } catch {
    return [];
  }
}
