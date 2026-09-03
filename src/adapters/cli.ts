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
  runInit,
  wireClaudeCode,
  syncClaudeCodeSkills,
  wireCodex,
  wirePi,
  wireHermes,
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
  type TraceEntry,
  type Harness,
  type DetectedHarness,
  type HeadlessRunner,
} from "../core/index.js";
import { claudeCodeRunner } from "./claude-code/runner.js";
import { codexRunner } from "./codex/runner.js";
import { openCodeRunner } from "./opencode/runner.js";
import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as readline from "node:readline/promises";

const DEFAULT_MAX_ITERATIONS = 10;
const DEFAULT_SAMPLE_SIZE = 20;

/**
 * The framework meta-skill (skills/wikiskill/SKILL.md) ships at the package
 * root, sibling to dist/. Walk up from this file's own location to find it —
 * one level up in the built package (dist/cli.mjs), two in source/test mode
 * (src/adapters/cli.ts) — rather than hardcoding either depth.
 */
function findFrameworkSkillPath(): string | undefined {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(dir, "skills", "wikiskill", "SKILL.md");
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return undefined;
}

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
  // Snapshot skills/*.md content now, before the proposer edits it — `validate`
  // diffs against this to find exactly which file it touched.
  state.skillSnapshot = await snapshotSkills(skillsDir);
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

const VALIDATE_RUNNERS: Partial<Record<Harness, HeadlessRunner>> = {
  "claude-code": claudeCodeRunner,
  codex: codexRunner,
  opencode: openCodeRunner,
};

/**
 * The real held-out gate: measures whatever skill(s) changed since the last
 * `evolve-prompt` against `.wikiskill/bench/`, accepts only if the pass rate
 * beats the stored best, rolls back otherwise, records the outcome, and
 * closes out the iteration. No self-reported scoring.
 */
async function cmdValidate(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const harnessArg = flag(args, "harness", "claude-code");
  const harness = (OPEN_ALIASES[harnessArg] ?? harnessArg) as Harness;
  const timeoutMs = Number(flag(args, "timeout-ms", "120000"));
  const limitFlag = flag(args, "bench-limit", "");
  const limit = limitFlag ? Number(limitFlag) : undefined;

  const runner = VALIDATE_RUNNERS[harness];
  if (!runner) {
    console.error(
      `[wikiskill] Unknown --harness "${harnessArg}". Expected: claude-code, codex, opencode.`,
    );
    process.exitCode = 1;
    return;
  }

  const skillsDir = skillsRoot(projectDir);
  const wikiDir = wikiRoot(projectDir);
  const state = await readState(projectDir);

  const currentSnapshot = await snapshotSkills(skillsDir);
  const changedIds = diffSkillSnapshots(state.skillSnapshot, currentSnapshot);

  if (changedIds.length === 0) {
    console.log(
      "[wikiskill] No skill changes detected since `evolve-prompt` — nothing to validate.",
    );
    state.evolving = false;
    await writeState(projectDir, state);
    await pruneTraces(tracesRoot(projectDir), 3);
    return;
  }

  const candidateSkills = await Promise.all(
    changedIds.map(async (id) => ({
      id,
      content: await fs.readFile(path.join(skillsDir, `${id}.md`), "utf-8"),
    })),
  );

  let result;
  try {
    result = await runValidationGate(projectDir, candidateSkills, runner, state.bestScore, {
      timeoutMs,
      limit,
    });
  } catch (err) {
    console.error(`[wikiskill] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
    return;
  }

  if (!result.ranBench) {
    console.log(
      "[wikiskill] No bench tasks configured under `.wikiskill/bench/<task-id>/{task.md,verify}` —\n" +
        "the proposed skill was NOT validated and is left in place unreviewed.\n" +
        "Add bench tasks to get a real accept/reject gate on the next iteration.",
    );
    state.evolving = false;
    await writeState(projectDir, state);
    await pruneTraces(tracesRoot(projectDir), 3);
    return;
  }

  for (const t of result.taskResults) {
    console.log(`  ${t.pass ? "✓" : "✗"} ${t.id}`);
  }
  console.log(
    `[wikiskill] R_val=${result.score.toFixed(3)} (${result.passed}/${result.total}) vs R_best=${result.bestScore.toFixed(3)} → ${result.accepted ? "ACCEPTED" : "REJECTED"}`,
  );

  const targetSkill = changedIds.join(", ");
  const record = buildImpactRecord(
    state.iteration,
    targetSkill,
    result.score,
    result.bestScore,
    result.accepted,
    `${result.passed}/${result.total} bench tasks passed`,
  );
  const nextState = await recordOutcome(state, record);
  await appendSkillImpact(wikiDir, record);

  if (!result.accepted) {
    for (const id of changedIds) await rollbackSkill(skillsDir, id);
  } else if (harness === "claude-code") {
    // Publish the accepted skill to where Claude Code actually loads it from.
    await syncClaudeCodeSkills(projectDir, findFrameworkSkillPath());
  }

  nextState.evolving = false;
  await writeState(projectDir, nextState);
  await pruneTraces(tracesRoot(projectDir), 3);
}

async function cmdReset(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  await writeState(projectDir, {
    bestScore: 0,
    iteration: 0,
    evolving: false,
    impactHistory: [],
    skillSnapshot: {},
  });
  console.log("✅ WikiSkill state reset. Wiki patterns and raw traces are preserved.");
}

const FORCE_FLAGS: Record<string, Harness> = {
  "--opencode": "opencode",
  "--claude-code": "claude-code",
  "--codex": "codex",
  "--pi": "pi",
  "--hermes": "hermes",
};
const ALL_HARNESSES: Harness[] = ["opencode", "claude-code", "codex", "pi", "hermes"];

/**
 * Wire whichever harnesses are already configured in the project (safe to
 * run unattended, e.g. from `postinstall` — it only completes wiring for a
 * harness whose own config already exists, never invents one). Pass
 * --opencode / --claude-code / --codex / --all to force-bootstrap a harness
 * from scratch on a fresh project.
 */
async function cmdInit(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const quiet = args.includes("--quiet");
  const force: Harness[] = args.includes("--all")
    ? ALL_HARNESSES
    : args
        .filter((a): a is keyof typeof FORCE_FLAGS => a in FORCE_FLAGS)
        .map((a) => FORCE_FLAGS[a]);

  const { harnesses, changes } = await runInit(projectDir, force, findFrameworkSkillPath());

  if (quiet && changes.length === 0) return;
  if (harnesses.length === 0) {
    if (!quiet) {
      console.log(
        "[wikiskill] No harness config detected (.claude/, AGENTS.md, .codex/, .pi/, SOUL.md, opencode.jsonc).\n" +
          "Run with --claude-code, --codex, --opencode, --pi, --hermes, or --all to wire one explicitly.",
      );
    }
    return;
  }
  console.log(`[wikiskill] init: ${harnesses.join(", ")}`);
  for (const c of changes) console.log(`  - ${c}`);
  if (changes.length === 0) console.log("  (already wired, nothing to do)");
}

const OPEN_ALIASES: Record<string, Harness> = {
  opencode: "opencode",
  claude: "claude-code",
  "claude-code": "claude-code",
  codex: "codex",
  pi: "pi",
  hermes: "hermes",
};

async function pickHarness(candidates: DetectedHarness[]): Promise<DetectedHarness> {
  console.log("Multiple harnesses found on PATH:");
  candidates.forEach((c, i) => console.log(`  ${i + 1}. ${c.command}  (${c.path})`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`Open which? [1-${candidates.length}]: `);
    const idx = Number.parseInt(answer.trim(), 10) - 1;
    const picked = candidates[idx];
    if (!picked) throw new Error(`Invalid selection: ${answer}`);
    return picked;
  } finally {
    rl.close();
  }
}

/**
 * Discover installed harness CLIs, pick one (explicit arg, sole match, or an
 * interactive prompt when several are found), finish wiring this project for
 * it, then hand off the terminal to it. Everything after `--` is forwarded
 * to the harness untouched.
 */
async function cmdOpen(args: string[]): Promise<void> {
  const sepIdx = args.indexOf("--");
  const ownArgs = sepIdx >= 0 ? args.slice(0, sepIdx) : args;
  const childArgs = sepIdx >= 0 ? args.slice(sepIdx + 1) : [];
  const projectDir = flag(ownArgs, "project", process.cwd());

  let harnessArg: string | undefined;
  for (let i = 0; i < ownArgs.length; i++) {
    if (ownArgs[i] === "--project") {
      i++;
      continue;
    }
    if (ownArgs[i].startsWith("--")) continue;
    harnessArg = ownArgs[i];
    break;
  }

  const installed = detectInstalledHarnesses();
  if (installed.length === 0) {
    console.error(
      "[wikiskill] No supported harness found on PATH (looked for: claude, codex, opencode, pi, hermes).\n" +
        "Install one, then run `wikiskill open` again.",
    );
    process.exitCode = 1;
    return;
  }

  let target: DetectedHarness;
  if (harnessArg) {
    const wanted = OPEN_ALIASES[harnessArg];
    const match = installed.find((h) => h.harness === wanted || h.command === harnessArg);
    if (!match) {
      console.error(
        `[wikiskill] "${harnessArg}" not found on PATH. Installed: ${installed.map((h) => h.command).join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }
    target = match;
  } else if (installed.length === 1) {
    target = installed[0];
  } else {
    target = await pickHarness(installed);
  }

  const frameworkSkillPath = findFrameworkSkillPath();
  const changes =
    target.harness === "claude-code"
      ? await wireClaudeCode(projectDir, frameworkSkillPath)
      : target.harness === "codex"
        ? await wireCodex(projectDir)
        : target.harness === "pi"
          ? await wirePi(projectDir, frameworkSkillPath)
          : target.harness === "hermes"
            ? await wireHermes(projectDir)
            : await checkOpenCode(projectDir);
  for (const c of changes) console.log(`[wikiskill] ${c}`);

  // Pi has no confirmed auto-discovery for a project instructions file —
  // pass it explicitly via the one CLI flag `pi --help` actually documents.
  if (target.harness === "pi") {
    childArgs.push("--append-system-prompt", piInstructionsPath(projectDir));
  }

  console.log(`[wikiskill] opening ${target.command}...`);
  const child = spawn(target.path, childArgs, { stdio: "inherit", cwd: projectDir });
  const code = await new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
  process.exitCode = code;
}

// ─── Workspace init (with demo bench) ─────────────────────────────────────────

async function cmdInitWorkspace(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const domain = args.find((a) => !a.startsWith("--")) ?? "demo";
  const backend = flag(args, "backend", "opencode");

  const workspace = new Workspace(path.join(projectDir, "workspaces", domain), domain);
  if (workspace.exists()) {
    console.log(`[wikiskill] Workspace "${domain}" already exists at ${workspace.root}`);
    return;
  }

  await workspace.init({ domain, backend });
  await generateDemoBench(workspace);

  // Copy framework skills
  const frameworkSrc = findFrameworkSkillPath();
  if (frameworkSrc) {
    const files = await fs.readdir(frameworkSrc);
    for (const file of files) {
      if (file.endsWith(".md")) {
        const content = await fs.readFile(path.join(frameworkSrc, file), "utf-8");
        await fs.writeFile(path.join(workspace.frameworkSkillsDir, file), content, "utf-8");
      }
    }
  }

  console.log(`[wikiskill] Created workspace "${domain}" at ${workspace.root}`);
  console.log(`  Backend: ${backend}`);
  console.log(
    `  Bench: ${DEMO_BENCH_TASKS.length} tasks (${DEMO_BENCH_TASKS.filter((t) => t.split === "train").length} train / ${DEMO_BENCH_TASKS.filter((t) => t.split === "val").length} val)`,
  );
  console.log(`\nNext: cd ${workspace.root} && wikiskill evolve --iters 3`);
}

// ─── Bench management ─────────────────────────────────────────────────────────

async function cmdBench(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const domain = args.find((a) => !a.startsWith("--")) ?? "demo";
  const workspace = new Workspace(path.join(projectDir, "workspaces", domain), domain);

  if (!workspace.exists()) {
    console.error(
      `[wikiskill] Workspace "${domain}" not found. Run "wikiskill init ${domain}" first.`,
    );
    process.exitCode = 1;
    return;
  }

  const subcmd = args[0] ?? "list";
  switch (subcmd) {
    case "list": {
      const tasks = await workspace.loadBenchTasks();
      console.log(`## Bench Tasks (${tasks.length} total)`);
      console.log(`| ID | Split | Title | Grader |`);
      console.log(`|----|-------|-------|--------|`);
      for (const t of tasks) {
        console.log(`| ${t.id} | ${t.split} | ${t.title} | ${t.grader.type} |`);
      }
      break;
    }
    case "reset": {
      await generateDemoBench(workspace);
      console.log(`[wikiskill] Regenerated demo bench (${DEMO_BENCH_TASKS.length} tasks)`);
      break;
    }
    default:
      console.error("Usage: wikiskill bench [list|reset]");
      process.exitCode = 1;
  }
}

// ─── Compare ──────────────────────────────────────────────────────────────────

async function cmdCompare(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const domainA = args[0];
  const domainB = args[1];

  if (!domainA || !domainB) {
    console.error("Usage: wikiskill compare <workspaceA> <workspaceB>");
    process.exitCode = 1;
    return;
  }

  const wsA = new Workspace(path.join(projectDir, "workspaces", domainA), domainA);
  const wsB = new Workspace(path.join(projectDir, "workspaces", domainB), domainB);

  // Load results from runs
  const resultsA = new Map<string, number>();
  const resultsB = new Map<string, number>();

  // For now, load from bench tasks and check skill-impact.md for scores
  const tasksA = await wsA.loadBenchTasks();
  const tasksB = await wsB.loadBenchTasks();

  // Extract scores from state
  const stateA = await readState(wsA.wikiSkillDir);
  const stateB = await readState(wsB.wikiSkillDir);

  // Use best scores as proxy for per-task results
  for (const task of tasksA) {
    resultsA.set(task.id, stateA.bestScore);
  }
  for (const task of tasksB) {
    resultsB.set(task.id, stateB.bestScore);
  }

  const result = compareResults(resultsA, resultsB);
  console.log(formatCompareResult(result));
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

async function cmdTransfer(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const sourceDomain = args[0];
  const targetDomain = args[1];

  if (!sourceDomain || !targetDomain) {
    console.error("Usage: wikiskill transfer <sourceWorkspace> <targetWorkspace>");
    process.exitCode = 1;
    return;
  }

  const source = new Workspace(path.join(projectDir, "workspaces", sourceDomain), sourceDomain);
  const target = new Workspace(path.join(projectDir, "workspaces", targetDomain), targetDomain);

  if (!source.exists()) {
    console.error(`[wikiskill] Source workspace "${sourceDomain}" not found.`);
    process.exitCode = 1;
    return;
  }
  if (!target.exists()) {
    console.error(`[wikiskill] Target workspace "${targetDomain}" not found.`);
    process.exitCode = 1;
    return;
  }

  const result = await transferSkills(source.activeSkillsDir, target.activeSkillsDir);
  console.log(formatTransferResult(result));
}

// ─── Cron ─────────────────────────────────────────────────────────────────────

async function cmdCron(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const subcmd = args[0] ?? "list";

  switch (subcmd) {
    case "list": {
      const schedules = await loadCronSchedule(projectDir);
      if (schedules.length === 0) {
        console.log("[wikiskill] No cron schedules configured.");
        console.log('Add one: wikiskill cron add "0 1 * * *" <domain> --iters 3');
        return;
      }
      console.log("## Cron Schedules");
      schedules.forEach((s, i) => console.log(formatSchedule(s, i)));
      break;
    }
    case "add": {
      const expression = args[1];
      const domain = args[2];
      if (!expression || !domain) {
        console.error(
          'Usage: wikiskill cron add "<cron-expression>" <domain> [--iters N] [--model M]',
        );
        process.exitCode = 1;
        return;
      }
      const iterations = Number(flag(args, "iters", "3"));
      const model = flag(args, "model", "");
      const provider = flag(args, "provider", "");

      const schedules = await addCronSchedule(projectDir, {
        expression,
        domain,
        iterations,
        model: model || undefined,
        provider: provider || undefined,
      });
      console.log(`[wikiskill] Added cron schedule (${schedules.length} total)`);
      break;
    }
    case "remove": {
      const idx = Number(args[1]);
      if (isNaN(idx)) {
        console.error("Usage: wikiskill cron remove <index>");
        process.exitCode = 1;
        return;
      }
      await removeCronSchedule(projectDir, idx);
      console.log(`[wikiskill] Removed schedule [${idx}]`);
      break;
    }
    case "toggle": {
      const idx = Number(args[1]);
      if (isNaN(idx)) {
        console.error("Usage: wikiskill cron toggle <index>");
        process.exitCode = 1;
        return;
      }
      await toggleCronSchedule(projectDir, idx);
      console.log(`[wikiskill] Toggled schedule [${idx}]`);
      break;
    }
    case "check": {
      const schedules = await loadCronSchedule(projectDir);
      const now = new Date();
      console.log(`[wikiskill] Checking schedules at ${now.toLocaleString()}`);
      for (const s of schedules) {
        if (s.enabled && shouldFireNow(s.expression, s.lastRun)) {
          console.log(`  🔥 Would fire: ${s.expression} → ${s.domain}`);
        }
      }
      break;
    }
    default:
      console.error("Usage: wikiskill cron [list|add|remove|toggle|check]");
      process.exitCode = 1;
  }
}

// ─── Tap ──────────────────────────────────────────────────────────────────────

async function cmdTap(args: string[]): Promise<void> {
  const projectDir = flag(args, "project", process.cwd());
  const subcmd = args[0] ?? "list";

  switch (subcmd) {
    case "list":
      console.log(formatTapSkills());
      break;
    case "install": {
      const skillId = args[1];
      if (!skillId) {
        console.error("Usage: wikiskill tap install <skillId> [--overwrite]");
        process.exitCode = 1;
        return;
      }
      const targetDir = path.join(projectDir, ".wikiskill", "skills", "tap");
      const overwrite = args.includes("--overwrite");
      const result = await installTapSkill(skillId, targetDir, overwrite);
      console.log(`[wikiskill] ${result.message}`);
      break;
    }
    case "install-all": {
      const targetDir = path.join(projectDir, ".wikiskill", "skills", "tap");
      const overwrite = args.includes("--overwrite");
      const result = await installAllTapSkills(targetDir, overwrite);
      console.log(
        `[wikiskill] Installed ${result.installed.length} skills, skipped ${result.skipped.length}`,
      );
      break;
    }
    default:
      console.error("Usage: wikiskill tap [list|install|install-all]");
      process.exitCode = 1;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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
    case "validate":
      return cmdValidate(rest);
    case "reset":
      return cmdReset(rest);
    case "init":
      return cmdInit(rest);
    case "workspace-init":
      return cmdInitWorkspace(rest);
    case "bench":
      return cmdBench(rest);
    case "compare":
      return cmdCompare(rest);
    case "transfer":
      return cmdTransfer(rest);
    case "cron":
      return cmdCron(rest);
    case "tap":
      return cmdTap(rest);
    case "open":
      return cmdOpen(rest);
    default:
      console.error(
        "Usage: wikiskill <command> [options]\n" +
          "\n" +
          "Commands:\n" +
          "  init                  Wire harnesses into this project (auto-detect)\n" +
          "  workspace-init <domain>  Create isolated workspace with demo bench\n" +
          "  bench [list|reset]    Manage bench tasks\n" +
          "  status                Show evolution state\n" +
          "  evolve-prompt         Print the evolution prompt for this iteration\n" +
          "  evolve-complete       Close out the current iteration\n" +
          "  validate              Run the gating validation against bench\n" +
          "  compare <A> <B>       Paired statistical comparison of two workspaces\n" +
          "  transfer <src> <dst>  Transfer skills between workspaces\n" +
          "  cron [list|add|remove|toggle|check]  Schedule evolution runs\n" +
          "  tap [list|install|install-all]       Install distilled patterns\n" +
          "  open [harness]        Launch a harness with WikiSkill wired\n" +
          "  trace / trace-manual  Log an execution trace\n" +
          "  reset                 Reset evolution state (preserves wiki)\n" +
          "\n" +
          "Options:\n" +
          "  --project DIR         Project directory (default: cwd)\n" +
          "  --harness <name>      claude-code|codex|opencode|pi|hermes\n" +
          "  --model <id>          Model to use for evolve\n" +
          "  --provider <name>     Provider to use for evolve",
      );
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[wikiskill]", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
