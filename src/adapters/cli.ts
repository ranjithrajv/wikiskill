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
  type TraceEntry,
} from "../core/index.js";
import * as fs from "node:fs/promises";

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_SAMPLE_SIZE = 20;

function flag(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

/** Claude Code PostToolUse hook payload → WikiSkill TraceEntry. */
function parseHookPayload(raw: string): TraceEntry {
  const payload = JSON.parse(raw);
  const response = payload.tool_response ?? {};
  const isError = Boolean(response?.error ?? response?.is_error ?? payload.is_error);
  return {
    id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    sessionID: payload.session_id ?? "unknown",
    tool: payload.tool_name ?? "unknown",
    input: payload.tool_input,
    result: isError ? { error: response?.error ?? "unknown error" } : response,
    status: isError ? "error" : "completed",
  };
}

async function cmdTrace(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const raw = await readStdin();
  if (!raw.trim()) return;
  const rawDir = tracesRoot(projectDir);
  await ensureTraces(rawDir);
  await appendTrace(rawDir, parseHookPayload(raw));
}

/**
 * Explicit, harness-agnostic trace entry — for harnesses with no tool-call
 * hook API (e.g. Codex CLI), where the agent self-instruments via AGENTS.md
 * instructions instead of a framework-fired hook.
 */
async function cmdTraceManual(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const tool = flag(args, "tool", "unknown");
  const status = flag(args, "status", "completed") === "error" ? "error" : "completed";
  const input = JSON.parse(flag(args, "input", "null"));
  const result = JSON.parse(flag(args, "result", "null"));

  const rawDir = tracesRoot(projectDir);
  await ensureTraces(rawDir);
  await appendTrace(rawDir, {
    id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    sessionID: flag(args, "session", "unknown"),
    tool,
    input,
    result,
    status,
  });
}

async function cmdStatus(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const state = await readState(projectDir);
  const wikiDir = wikiRoot(projectDir);
  const rawDir = tracesRoot(projectDir);
  await ensureWiki(wikiDir);
  const stats = await traceStats(rawDir);
  const patterns = await listPatterns(wikiDir);
  const log = await readEvolutionLog(wikiDir);

  console.log(
    buildStatusText({
      iteration: state.iteration,
      maxIterations: DEFAULT_MAX_ITERATIONS,
      bestScore: state.bestScore,
      patternCount: patterns.length,
      totalTraces: stats.totalTraces,
      sessions: stats.sessions,
      successRate: stats.successRate,
      accepted: state.impactHistory.filter((h) => h.outcome === "accepted").length,
      rejected: state.impactHistory.filter((h) => h.outcome === "rejected").length,
      recentPatterns: patterns.slice(-5).map((p) => ({ title: p.title, category: p.category })),
      logTail: log,
    }),
  );
}

async function cmdEvolvePrompt(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const sampleSize = Number(flag(args, "sample-size", String(DEFAULT_SAMPLE_SIZE)));
  const maxIterations = Number(flag(args, "max-iterations", String(DEFAULT_MAX_ITERATIONS)));

  const wikiDir = wikiRoot(projectDir);
  const rawDir = tracesRoot(projectDir);
  const skillsDir = skillsRoot(projectDir);
  await ensureWiki(wikiDir);
  await ensureTraces(rawDir);
  await fs.mkdir(skillsDir, { recursive: true });

  const state = await readState(projectDir);
  if (state.evolving) {
    console.log("⚠️ WikiSkill evolution is already in progress. Please wait for it to complete.");
    return;
  }
  if (state.iteration >= maxIterations) {
    console.log(
      `⚠️ WikiSkill has reached the maximum iteration limit (${maxIterations}). Run \`wikiskill reset\` to start over.`,
    );
    return;
  }

  state.evolving = true;
  state.iteration++;
  await writeState(projectDir, state);

  console.log(buildEvolutionPrompt(state.iteration, projectDir, sampleSize));
}

async function cmdEvolveComplete(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const state = await readState(projectDir);
  state.evolving = false;
  await writeState(projectDir, state);
  await pruneTraces(tracesRoot(projectDir), 3);
}

async function cmdReset(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  await writeState(projectDir, {
    bestScore: 0,
    iteration: 0,
    evolving: false,
    impactHistory: [],
  });
  console.log("✅ WikiSkill state reset. Wiki patterns and raw traces are preserved.");
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "trace":
      return cmdTrace(rest);
    case "trace-manual":
      return cmdTraceManual(rest);
    case "status":
      return cmdStatus(rest);
    case "evolve-prompt":
      return cmdEvolvePrompt(rest);
    case "evolve-complete":
      return cmdEvolveComplete(rest);
    case "reset":
      return cmdReset(rest);
    default:
      console.error(
        "Usage: wikiskill <trace|trace-manual|status|evolve-prompt|evolve-complete|reset> [--project DIR]",
      );
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[wikiskill]", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
