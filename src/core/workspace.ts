// ─── Workspace: isolated evolution environment ────────────────────────────────
// Each workspace is a self-contained evolution domain with its own bench,
// skills, wiki, and isolated profile. Inspired by ashutoshsinghpr7's isolated
// HERMES_HOME per workspace — gating is only meaningful if the agent sees
// *exactly* the candidate skill set.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface WorkspaceConfig {
  domain: string;
  backend: string;
  model?: string;
  provider?: string;
  maxTurns?: number;
  createdAt: number;
}

export interface DemoBenchTask {
  id: string;
  split: "train" | "val";
  title: string;
  prompt: string;
  sandbox: Record<string, string>;
  grader: {
    type: "exact" | "contains" | "json_field" | "code_stdout";
    file: string;
    expected?: string;
    field?: string;
  };
}

/**
 * A workspace is an isolated evolution environment. It bundles:
 * - `.wikiskill/` — raw traces, wiki, skills, state
 * - `bench/` — auto-graded tasks (train/val split)
 * - `runs/` — per-run output (stdout, proposals, state snapshots)
 * - `profile/` — isolated agent profile (empty memory, bundled skills opted out)
 */
export class Workspace {
  readonly root: string;
  readonly domain: string;

  constructor(root: string, domain: string) {
    this.root = root;
    this.domain = domain;
  }

  // ─── Paths ──────────────────────────────────────────────────────────────

  get configPath(): string {
    return path.join(this.root, "workspace.json");
  }

  get wikiSkillDir(): string {
    return path.join(this.root, ".wikiskill");
  }

  get rawDir(): string {
    return path.join(this.wikiSkillDir, "raw");
  }

  get wikiDir(): string {
    return path.join(this.wikiSkillDir, "wiki");
  }

  get skillsDir(): string {
    return path.join(this.wikiSkillDir, "skills");
  }

  get frameworkSkillsDir(): string {
    return path.join(this.skillsDir, "framework");
  }

  get activeSkillsDir(): string {
    return path.join(this.skillsDir, "active");
  }

  get profileDir(): string {
    return path.join(this.root, "profile");
  }

  get benchDir(): string {
    return path.join(this.root, "bench");
  }

  get benchTasksPath(): string {
    return path.join(this.benchDir, "tasks.json");
  }

  get runsDir(): string {
    return path.join(this.root, "runs");
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  async init(config: Omit<WorkspaceConfig, "createdAt">): Promise<void> {
    await fs.mkdir(this.rawDir, { recursive: true });
    await fs.mkdir(path.join(this.wikiDir, "patterns"), { recursive: true });
    await fs.mkdir(this.frameworkSkillsDir, { recursive: true });
    await fs.mkdir(this.activeSkillsDir, { recursive: true });
    await fs.mkdir(this.profileDir, { recursive: true });
    await fs.mkdir(this.benchDir, { recursive: true });
    await fs.mkdir(this.runsDir, { recursive: true });

    const fullConfig: WorkspaceConfig = { ...config, createdAt: Date.now() };
    await fs.writeFile(this.configPath, JSON.stringify(fullConfig, null, 2), "utf-8");
  }

  async loadConfig(): Promise<WorkspaceConfig> {
    const raw = await fs.readFile(this.configPath, "utf-8");
    return JSON.parse(raw) as WorkspaceConfig;
  }

  exists(): boolean {
    return existsSync(this.configPath);
  }

  // ─── Bench ──────────────────────────────────────────────────────────────

  async loadBenchTasks(): Promise<DemoBenchTask[]> {
    try {
      const raw = await fs.readFile(this.benchTasksPath, "utf-8");
      return JSON.parse(raw) as DemoBenchTask[];
    } catch {
      return [];
    }
  }

  async getTrainTasks(): Promise<DemoBenchTask[]> {
    return (await this.loadBenchTasks()).filter((t) => t.split === "train");
  }

  async getValTasks(): Promise<DemoBenchTask[]> {
    return (await this.loadBenchTasks()).filter((t) => t.split === "val");
  }

  // ─── Runs ───────────────────────────────────────────────────────────────

  async createRunDir(iteration: number): Promise<string> {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(this.runsDir, `iter-${iteration.toString().padStart(2, "0")}-${ts}`);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }
}

// ─── Demo bench tasks ──────────────────────────────────────────────────────────

export const DEMO_BENCH_TASKS: DemoBenchTask[] = [
  {
    id: "exact-match-1",
    split: "train",
    title: "Format products according to spec",
    prompt:
      "Read spec.md and products.json. Write output.txt with products sorted alphabetically by name, one per line as 'name|price|status'. Only include active products.",
    sandbox: {
      "spec.md":
        "Sort products alphabetically by name. Format: name|price|status (one per line). Only active products.",
      "products.json": JSON.stringify([
        { name: "Zebra", price: 35, status: "active" },
        { name: "Apple", price: 12, status: "active" },
        { name: "Mango", price: 8, status: "inactive" },
        { name: "Banana", price: 15, status: "active" },
      ]),
    },
    grader: {
      type: "exact",
      file: "output.txt",
      expected: "Apple|12|active\nBanana|15|active\nZebra|35|active",
    },
  },
  {
    id: "exact-match-2",
    split: "train",
    title: "Sum even numbers",
    prompt: "Read numbers.txt. Write sum.txt with the sum of all even numbers (one per line).",
    sandbox: { "numbers.txt": "3\n8\n5\n12\n7\n4\n9\n" },
    grader: { type: "exact", file: "sum.txt", expected: "24" },
  },
  {
    id: "contains-1",
    split: "train",
    title: "Greet by name",
    prompt: "Read name.txt. Write greeting.txt with a greeting that includes the name.",
    sandbox: { "name.txt": "Alice" },
    grader: { type: "contains", file: "greeting.txt", expected: "Alice" },
  },
  {
    id: "json-field-1",
    split: "train",
    title: "Extract configuration",
    prompt:
      "Read config.json. Write result.json with a 'total' field that sums the 'values' array.",
    sandbox: { "config.json": JSON.stringify({ name: "test", values: [10, 20, 30, 40] }) },
    grader: { type: "json_field", file: "result.json", field: "total", expected: "100" },
  },
  {
    id: "code-stdout-1",
    split: "train",
    title: "Fibonacci sequence",
    prompt: "Write fib.py that prints the first 10 Fibonacci numbers separated by spaces.",
    sandbox: {},
    grader: { type: "code_stdout", file: "fib.py", expected: "0 1 1 2 3 5 8 13 21 34" },
  },
  {
    id: "debug-1",
    split: "train",
    title: "Fix the broken script",
    prompt: "Read broken.py and fix the bug. Write the fixed version to fixed.py.",
    sandbox: { "broken.py": "def greet(name):\n    return 'Hello, ' + name\n\nprint(greet)\n" },
    grader: { type: "code_stdout", file: "fixed.py", expected: "Hello, World" },
  },
  {
    id: "multi-step-1",
    split: "train",
    title: "Process and filter data",
    prompt:
      "Read data.csv. Filter rows where age > 25. Write filtered.csv with only name and city columns.",
    sandbox: {
      "data.csv": "name,age,city\nAlice,30,NYC\nBob,22,LA\nCharlie,35,Chicago\nDiana,28,Boston\n",
    },
    grader: {
      type: "exact",
      file: "filtered.csv",
      expected: "name,city\nAlice,NYC\nCharlie,Chicago\nDiana,Boston",
    },
  },
  {
    id: "subtle-spec-1",
    split: "val",
    title: "Apply spec literally",
    prompt: "Read spec.md and input.txt. Follow the spec exactly. Write output.txt.",
    sandbox: {
      "spec.md":
        "Convert input to UPPERCASE. Do NOT add any extra characters, not even a trailing newline.",
      "input.txt": "hello world",
    },
    grader: { type: "exact", file: "output.txt", expected: "HELLO WORLD" },
  },
  {
    id: "subtle-spec-2",
    split: "val",
    title: "Count words precisely",
    prompt:
      "Read text.txt. Write count.txt with the exact number of words. A word is separated by whitespace.",
    sandbox: { "text.txt": "  hello   world  foo bar  " },
    grader: { type: "exact", file: "count.txt", expected: "4" },
  },
  {
    id: "val-json-1",
    split: "val",
    title: "Merge configurations",
    prompt: "Read a.json and b.json. Write merged.json with both merged (b overrides a).",
    sandbox: {
      "a.json": JSON.stringify({ x: 1, y: 2, z: 3 }),
      "b.json": JSON.stringify({ y: 99, w: 4 }),
    },
    grader: { type: "json_field", file: "merged.json", field: "y", expected: "99" },
  },
  {
    id: "val-code-1",
    split: "val",
    title: "Implement binary search",
    prompt:
      "Write bsearch.py that implements binary search. It should read a sorted list and target from input.json and write the index to output.json.",
    sandbox: { "input.json": JSON.stringify({ arr: [1, 3, 5, 7, 9, 11], target: 7 }) },
    grader: { type: "json_field", file: "output.json", field: "index", expected: "3" },
  },
];

/** Generate the demo bench (11 tasks: 7 train / 4 val). */
export async function generateDemoBench(workspace: Workspace): Promise<void> {
  await fs.mkdir(workspace.benchDir, { recursive: true });
  await fs.writeFile(workspace.benchTasksPath, JSON.stringify(DEMO_BENCH_TASKS, null, 2), "utf-8");
}

/** Grade a single task's output. Returns a score between 0 and 1. */
export async function gradeTask(
  task: DemoBenchTask,
  outputDir: string,
): Promise<{ score: number; detail: string }> {
  const outputFile = path.join(outputDir, task.grader.file);

  try {
    const actual = (await fs.readFile(outputFile, "utf-8")).trim();
    const expected = task.grader.expected ?? "";

    switch (task.grader.type) {
      case "exact":
        return {
          score: actual === expected ? 1 : 0,
          detail: actual === expected ? "pass" : `expected "${expected}", got "${actual}"`,
        };
      case "contains":
        return {
          score: actual.includes(expected) ? 1 : 0,
          detail: actual.includes(expected) ? "pass" : `expected to contain "${expected}"`,
        };
      case "json_field": {
        try {
          const parsed = JSON.parse(actual);
          const actualField = String(parsed[task.grader.field!] ?? "");
          return {
            score: actualField === expected ? 1 : 0,
            detail:
              actualField === expected
                ? "pass"
                : `expected ${task.grader.field}=${expected}, got ${actualField}`,
          };
        } catch {
          return { score: 0, detail: "invalid JSON output" };
        }
      }
      case "code_stdout":
        return { score: actual ? 0.5 : 0, detail: "code execution required for full grading" };
      default:
        return { score: 0, detail: "unknown grader type" };
    }
  } catch {
    return { score: 0, detail: `missing output file: ${task.grader.file}` };
  }
}
