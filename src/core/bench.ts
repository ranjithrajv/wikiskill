// ─── Bench: held-out validation tasks ──────────────────────────────────────────
// A task is a directory under `.wikiskill/bench/<id>/`:
//   task.md    — the prompt to run (required)
//   verify     — executable; exit 0 = pass, nonzero = fail (required)
//   fixture/   — optional starting files, copied into a fresh temp dir per run
//
// Opt-in by design: no tasks means no gate, so existing projects with no
// bench configured behave exactly as before.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { wikiSkillRoot } from "./paths.js";

export function benchRoot(projectDir: string): string {
  return path.join(wikiSkillRoot(projectDir), "bench");
}

export interface BenchTask {
  id: string;
  prompt: string;
  fixtureDir: string | null;
  verifyPath: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** All configured bench tasks (skips any directory missing task.md or verify). */
export async function listBenchTasks(projectDir: string): Promise<BenchTask[]> {
  const root = benchRoot(projectDir);
  let entries: string[];
  try {
    entries = (await fs.readdir(root, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }

  const tasks: BenchTask[] = [];
  for (const id of entries) {
    const dir = path.join(root, id);
    const taskFile = path.join(dir, "task.md");
    const verifyPath = path.join(dir, "verify");
    if (!(await exists(taskFile)) || !(await exists(verifyPath))) continue;
    tasks.push({
      id,
      prompt: await fs.readFile(taskFile, "utf-8"),
      fixtureDir: (await exists(path.join(dir, "fixture"))) ? path.join(dir, "fixture") : null,
      verifyPath,
    });
  }
  return tasks;
}

/** A fresh, isolated working directory for one task run — never the real project. */
export async function makeTaskWorkDir(taskId: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `wikiskill-bench-${taskId}-`));
}

/** Run a task's verify script against its work dir. Exit 0 = pass. */
export function runVerify(verifyPath: string, workDir: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(verifyPath, [], { cwd: workDir, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve(false);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
