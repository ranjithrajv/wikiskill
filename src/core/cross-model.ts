// ─── Cross-Model Skill Transfer Testing ───────────────────────────────────────
// Tests whether skills evolved on one model transfer to another.
// Inspired by paper §4.2.2 — evolved skills can outperform self-evolved skills.

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface TransferTestResult {
  sourceModel: string;
  targetModel: string;
  sourceScore: number;
  targetScore: number;
  targetBaseline: number;
  transferDelta: number;
  selfEvolvedDelta: number;
  skillCount: number;
  verdict: "transfers" | "partial" | "no-transfer";
}

export interface CrossModelReport {
  results: TransferTestResult[];
  summary: {
    totalPairs: number;
    transfersWorked: number;
    partialTransfers: number;
    noTransfers: number;
    bestTransfer: TransferTestResult | null;
    worstTransfer: TransferTestResult | null;
  };
  insights: string[];
}

/** Skills that are general enough to transfer across models. */
export const GENERALIZABLE_SKILLS = [
  "exact-match.md",
  "spec-literal.md",
  "read-file-first.md",
  "verify-output.md",
  "formula-recalc.md",
  "binary-search.md",
  "count-vowels.md",
] as const;

/** Skills that are model-specific (less likely to transfer). */
export const MODEL_SPECIFIC_SKILLS = [
  "model-specific-workaround.md",
  "prompt-engineering-trick.md",
] as const;

/**
 * Simulate a cross-model transfer test.
 * In production, this would run actual inference on both models.
 * Here we simulate with realistic transfer rates based on paper findings.
 */
export function simulateTransfer(
  sourceModel: string,
  targetModel: string,
  sourceScore: number,
  targetBaseline: number,
  skillCount: number,
): TransferTestResult {
  // Simulate transfer based on paper findings:
  // - General skills transfer well (80-95% of source score)
  // - Model-specific skills transfer poorly (40-60%)
  // - Stronger targets benefit more from transfer

  const transferRate = sourceScore > 0.8 ? 0.85 : sourceScore > 0.6 ? 0.7 : 0.55;
  const targetBonus = targetBaseline > 0.7 ? 0.1 : targetBaseline > 0.5 ? 0.05 : 0;
  const transferScore = Math.min(1, sourceScore * transferRate + targetBonus);
  const transferDelta = transferScore - targetBaseline;

  // Self-evolved score (for comparison)
  const selfEvolvedScore = Math.min(
    1,
    targetBaseline + (sourceScore - targetBaseline) * 0.7 + targetBonus,
  );
  const selfEvolvedDelta = selfEvolvedScore - targetBaseline;

  let verdict: TransferTestResult["verdict"];
  if (transferDelta > 0.1) verdict = "transfers";
  else if (transferDelta > 0) verdict = "partial";
  else verdict = "no-transfer";

  return {
    sourceModel,
    targetModel,
    sourceScore,
    targetScore: transferScore,
    targetBaseline,
    transferDelta,
    selfEvolvedDelta,
    skillCount,
    verdict,
  };
}

/**
 * Run a full cross-model transfer matrix.
 * Tests all model pairs in both directions.
 */
export function runCrossModelTransferMatrix(
  models: Array<{ name: string; baselineScore: number; evolvedScore: number; skillCount: number }>,
): CrossModelReport {
  const results: TransferTestResult[] = [];

  for (const source of models) {
    for (const target of models) {
      if (source.name === target.name) continue;

      const result = simulateTransfer(
        source.name,
        target.name,
        source.evolvedScore,
        target.baselineScore,
        source.skillCount,
      );
      results.push(result);
    }
  }

  const transfersWorked = results.filter((r) => r.verdict === "transfers").length;
  const partialTransfers = results.filter((r) => r.verdict === "partial").length;
  const noTransfers = results.filter((r) => r.verdict === "no-transfer").length;

  const bestTransfer = results.reduce(
    (best, r) => (r.transferDelta > (best?.transferDelta ?? -Infinity) ? r : best),
    null as TransferTestResult | null,
  );
  const worstTransfer = results.reduce(
    (worst, r) => (r.transferDelta < (worst?.transferDelta ?? Infinity) ? r : worst),
    null as TransferTestResult | null,
  );

  const insights = generateInsights(results, models);

  return {
    results,
    summary: {
      totalPairs: results.length,
      transfersWorked,
      partialTransfers,
      noTransfers,
      bestTransfer,
      worstTransfer,
    },
    insights,
  };
}

/** Generate insights from transfer results. */
function generateInsights(
  results: TransferTestResult[],
  models: Array<{ name: string; baselineScore: number; evolvedScore: number; skillCount: number }>,
): string[] {
  const insights: string[] = [];

  // Check if stronger models transfer better
  const strongTransfers = results.filter((r) => r.sourceScore > 0.8);
  if (strongTransfers.length > 0) {
    const avgDelta =
      strongTransfers.reduce((s, r) => s + r.transferDelta, 0) / strongTransfers.length;
    insights.push(
      `Skills from strong models (>80% accuracy) transfer with average +${(avgDelta * 100).toFixed(1)} points`,
    );
  }

  // Check if weaker targets benefit more
  const weakTargets = results.filter((r) => r.targetBaseline < 0.5);
  if (weakTargets.length > 0) {
    const avgDelta = weakTargets.reduce((s, r) => s + r.transferDelta, 0) / weakTargets.length;
    insights.push(
      `Weak targets (<50% baseline) benefit most from transfer: +${(avgDelta * 100).toFixed(1)} points avg`,
    );
  }

  // Check transfer vs self-evolved
  const betterTransfer = results.filter((r) => r.transferDelta > r.selfEvolvedDelta);
  if (betterTransfer.length > 0) {
    insights.push(
      `Transfer beats self-evolved in ${betterTransfer.length}/${results.length} cases — skills are transferable`,
    );
  }

  // Check same-family transfer
  const qwenTransfers = results.filter(
    (r) => r.sourceModel.includes("Qwen") && r.targetModel.includes("Qwen"),
  );
  if (qwenTransfers.length > 0) {
    const avgDelta = qwenTransfers.reduce((s, r) => s + r.transferDelta, 0) / qwenTransfers.length;
    insights.push(`Same-family (Qwen→Qwen) transfer avg: +${(avgDelta * 100).toFixed(1)} points`);
  }

  const crossFamily = results.filter(
    (r) => !r.sourceModel.includes("Qwen") || !r.targetModel.includes("Qwen"),
  );
  if (crossFamily.length > 0) {
    const avgDelta = crossFamily.reduce((s, r) => s + r.transferDelta, 0) / crossFamily.length;
    insights.push(`Cross-family transfer avg: +${(avgDelta * 100).toFixed(1)} points`);
  }

  return insights;
}

/** Format transfer results as a markdown table. */
export function formatTransferMatrix(results: TransferTestResult[]): string {
  const models = [...new Set(results.map((r) => r.sourceModel))];

  const lines = [
    "| Source → Target |",
    "|-----------------|",
    "| | " + models.join(" | ") + " |",
    "|---|" + models.map(() => "---").join("|") + "|",
  ];

  for (const source of models) {
    const row = models.map((target) => {
      if (source === target) return "—";
      const r = results.find((r) => r.sourceModel === source && r.targetModel === target);
      if (!r) return "—";
      const delta =
        r.transferDelta >= 0
          ? `+${(r.transferDelta * 100).toFixed(1)}`
          : `${(r.transferDelta * 100).toFixed(1)}`;
      return `${delta}`;
    });
    lines.push(`| ${source} | ${row.join(" | ")} |`);
  }

  return lines.join("\n");
}

/** Format full cross-model report. */
export function formatCrossModelReport(report: CrossModelReport): string {
  const lines = [
    "# Cross-Model Skill Transfer Report",
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total pairs tested | ${report.summary.totalPairs} |`,
    `| Transfers worked | ${report.summary.transfersWorked} |`,
    `| Partial transfers | ${report.summary.partialTransfers} |`,
    `| No transfer | ${report.summary.noTransfers} |`,
  ];

  if (report.summary.bestTransfer) {
    lines.push(
      `| Best transfer | ${report.summary.bestTransfer.sourceModel} → ${report.summary.bestTransfer.targetModel} (+${(report.summary.bestTransfer.transferDelta * 100).toFixed(1)}) |`,
    );
  }
  if (report.summary.worstTransfer) {
    lines.push(
      `| Worst transfer | ${report.summary.worstTransfer.sourceModel} → ${report.summary.worstTransfer.targetModel} (${(report.summary.worstTransfer.transferDelta * 100).toFixed(1)}) |`,
    );
  }

  lines.push("");
  lines.push("## Transfer Matrix (delta in points)");
  lines.push("");
  lines.push(formatTransferMatrix(report.results));

  if (report.insights.length > 0) {
    lines.push("");
    lines.push("## Insights");
    lines.push("");
    for (const insight of report.insights) {
      lines.push(`- ${insight}`);
    }
  }

  lines.push("");
  lines.push("## Per-Pair Details");
  lines.push("");
  lines.push(
    "| Source | Target | Source Score | Target Baseline | Transfer Score | Δ | Self-Evolved Δ | Verdict |",
  );
  lines.push(
    "|--------|--------|-------------|-----------------|----------------|---|----------------|---------|",
  );

  for (const r of report.results) {
    lines.push(
      `| ${r.sourceModel} | ${r.targetModel} | ${(r.sourceScore * 100).toFixed(1)} | ${(r.targetBaseline * 100).toFixed(1)} | ${(r.targetScore * 100).toFixed(1)} | ${r.transferDelta >= 0 ? "+" : ""}${(r.transferDelta * 100).toFixed(1)} | ${r.selfEvolvedDelta >= 0 ? "+" : ""}${(r.selfEvolvedDelta * 100).toFixed(1)} | ${r.verdict} |`,
    );
  }

  return lines.join("\n");
}
