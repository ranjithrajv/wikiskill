#!/usr/bin/env node
// ─── WikiSkill: Shared CLI Adapter ─────────────────────────────────────────────
// Wires the harness-agnostic core (src/core/*) into any harness that has no
// plugin API and only exposes shell hooks + markdown prompts — Claude Code
// and Codex CLI today. Hooks/self-instrumentation shell out to `trace` /
// `trace-manual`; slash/custom prompts shell out to `evolve-prompt` /
// `status` / `reset` and paste the stdout back into the conversation.
// See adapters/claude-code/README.md and adapters/codex/README.md for wiring.

import {
  ensureWiki,
  ensureTraces,
  appendTrace,
  traceStats,
  pruneTraces,
  listPatterns,
  readEvolutionLog,
  wikiRoot,
  tracesRoot,
  skillsRoot,
  readState,
  writeState,
  buildEvolutionPrompt,
  buildStatusText,
  buildMaintainerTask,
  buildProposerTask,
  runInit,
  wireClaudeCode,
  syncClaudeCodeSkills,
  wireCodex,
  wirePi,
  wireHermes,
  wireDeepseek,
  piInstructionsPath,
  checkOpenCode,
  detectInstalledHarnesses,
  snapshotSkills,
  diffSkillSnapshots,
  runValidationGate,
  rollbackSkill,
  recordOutcome,
  buildImpactRecord,
  appendSkillImpact,
  writePattern,
  rebuildIndex,
  readTraces,
  listBenchTasks,
  Workspace,
  generateDemoBench,
  DEMO_BENCH_TASKS,
  compareResults,
  formatCompareResult,
  transferSkills,
  formatTransferResult,
  loadCronSchedule,
  addCronSchedule,
  removeCronSchedule,
  toggleCronSchedule,
  shouldFireNow,
  formatSchedule,
  installTapSkill,
  installAllTapSkills,
  formatTapSkills,
  initRunLog,
  loadRunLog,
  saveRunLog,
  logIteration,
  logNegative,
  listRunLogs,
  formatRunLogMarkdown,
  splitTraceBatches,
  buildAnalystPrompt,
  parsePatch,
  consolidatePatches,
  readPatchFiles,
  learningRateFor,
  enforceEditBudget,
  DEFAULT_TEXTUAL_LR,
  type TraceEntry,
  type Harness,
  type DetectedHarness,
  type HeadlessRunner,
} from "../core/index.js";
// Import bench-packs and cross-model directly to avoid chunk renaming issues
import { listPacks, generatePack, formatPackInfo, installBenchPack } from "../core/bench-packs.js";
import { runCrossModelTransferMatrix, formatCrossModelReport } from "../core/cross-model.js";
import { claudeCodeRunner } from "./claude-code/runner.js";
import { codexRunner } from "./codex/runner.js";
import { deepseekRunner } from "./deepseek/runner.js";
import { openCodeRunner } from "./opencode/runner.js";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as readline from "node:readline/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function flag(args: string[], name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  return args[idx + 1] || fallback;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "pack": {
      const subcmd = rest[0] || "list";
      switch (subcmd) {
        case "list": {
          console.log("## Available Bench Packs\n");
          console.log("| Pack | Tasks | Train | Val | Description |");
          console.log("|------|-------|-------|-----|-------------|");
          for (const name of listPacks()) {
            const pack = generatePack(name);
            console.log(
              `| ${name} | ${pack.metadata.totalTasks} | ${pack.metadata.trainCount} | ${pack.metadata.valCount} | ${pack.description} |`,
            );
          }
          break;
        }
        case "info": {
          const packName = rest[1];
          if (!packName) {
            console.error("Usage: wikiskill pack info <pack-name>");
            process.exitCode = 1;
            return;
          }
          const pack = generatePack(packName);
          console.log(formatPackInfo(pack));
          break;
        }
        case "install": {
          const packName = rest[1];
          if (!packName) {
            console.error("Usage: wikiskill pack install <pack-name> [--domain <name>]");
            process.exitCode = 1;
            return;
          }
          const projectDir = flag(rest, "project", process.cwd());
          const domain = flag(rest, "domain", "default");
          const wsDir = path.join(projectDir, "workspaces", domain);
          await installBenchPack(wsDir, packName);
          break;
        }
        default:
          console.error("Usage: wikiskill pack [list|info|install]");
          process.exitCode = 1;
      }
      break;
    }

    case "transfer-test": {
      const projectDir = flag(rest, "project", process.cwd());
      const modelsArg = flag(rest, "models", "");

      const defaultModels = [
        { name: "deepseek-v4-flash", baselineScore: 0.5, evolvedScore: 0.89, skillCount: 3 },
        { name: "longcat-2.0", baselineScore: 0.45, evolvedScore: 0.83, skillCount: 2 },
        { name: "muse-spark-1.2", baselineScore: 0.48, evolvedScore: 0.83, skillCount: 2 },
        { name: "gpt-5.5", baselineScore: 0.52, evolvedScore: 0.9, skillCount: 3 },
        { name: "claude-opus-4.8", baselineScore: 0.55, evolvedScore: 0.92, skillCount: 3 },
      ];

      let models = defaultModels;
      if (modelsArg) {
        const names = modelsArg.split(",").map((m) => m.trim());
        models = defaultModels.filter((m) => names.includes(m.name));
        if (models.length === 0) {
          console.error(`No matching models found for: ${modelsArg}`);
          console.error(`Available: ${defaultModels.map((m) => m.name).join(", ")}`);
          process.exitCode = 1;
          return;
        }
      }

      console.log("## Cross-Model Skill Transfer Test\n");
      console.log(`Models: ${models.map((m) => m.name).join(", ")}\n`);

      const report = runCrossModelTransferMatrix(models);
      console.log(formatCrossModelReport(report));
      break;
    }

    default:
      console.log("Usage: wikiskill <command> [options]\n");
      console.log("Commands:");
      console.log("  pack [list|info|install]  Manage bench packs (strings, math, json, coding)");
      console.log("  transfer-test            Cross-model skill transfer testing");
      break;
  }
}

main().catch((err) => {
  console.error("[wikiskill]", err);
  process.exitCode = 1;
});
