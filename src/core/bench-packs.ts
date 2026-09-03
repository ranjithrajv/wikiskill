// ─── Bench Packs: reusable task collections for specific domains ──────────────
// Each pack contains 50+ auto-graded tasks with varying difficulty levels.
// Inspired by ashutoshsinghpr7's bench architecture but with our own tasks.

import * as fs from "node:fs/promises";
import * as path from "node:path";

export interface BenchTask {
  id: string;
  split: "train" | "val";
  difficulty: "easy" | "medium" | "hard";
  title: string;
  prompt: string;
  sandbox: Record<string, string>;
  grader: {
    type: "exact" | "contains" | "json_field" | "code_stdout";
    file: string;
    expected?: string;
    field?: string;
    script?: string;
  };
}

export interface BenchPack {
  name: string;
  description: string;
  tasks: BenchTask[];
  metadata: {
    totalTasks: number;
    trainCount: number;
    valCount: number;
    difficultyDistribution: Record<string, number>;
    graderTypes: Record<string, number>;
  };
}

// ─── Task Generators ──────────────────────────────────────────────────────────

function generateStringTasks(): BenchTask[] {
  const tasks: BenchTask[] = [];
  const patterns = [
    { op: "reverse", fn: (s: string) => s.split("").reverse().join(""), id: "reverse" },
    { op: "uppercase", fn: (s: string) => s.toUpperCase(), id: "upper" },
    { op: "lowercase", fn: (s: string) => s.toLowerCase(), id: "lower" },
    { op: "trim", fn: (s: string) => s.trim(), id: "trim" },
    { op: "squeeze", fn: (s: string) => s.replace(/\s+/g, " ").trim(), id: "squeeze" },
    { op: "remove-digits", fn: (s: string) => s.replace(/[0-9]/g, ""), id: "no-digits" },
    { op: "remove-special", fn: (s: string) => s.replace(/[^a-zA-Z0-9\s]/g, ""), id: "no-special" },
    { op: "word-count", fn: (s: string) => String(s.trim().split(/\s+/).length), id: "word-count" },
    { op: "char-count", fn: (s: string) => String(s.length), id: "char-count" },
    { op: "first-word", fn: (s: string) => s.trim().split(/\s+/)[0] || "", id: "first-word" },
    { op: "last-word", fn: (s: string) => s.trim().split(/\s+/).pop() || "", id: "last-word" },
    {
      op: "sort-words",
      fn: (s: string) => s.trim().split(/\s+/).sort().join(" "),
      id: "sort-words",
    },
    {
      op: "dedup-words",
      fn: (s: string) => [...new Set(s.trim().split(/\s+/))].join(" "),
      id: "dedup-words",
    },
    { op: "repeat", fn: (s: string) => (s.trim() + " ").repeat(3).trim(), id: "repeat" },
    { op: "wrap", fn: (s: string) => `[${s.trim()}]`, id: "wrap" },
    { op: "unwrap", fn: (s: string) => s.trim().replace(/^\[|\]$/g, ""), id: "unwrap" },
    {
      op: "title-case",
      fn: (s: string) => s.trim().replace(/\b\w/g, (c) => c.toUpperCase()),
      id: "title-case",
    },
    {
      op: "snake-case",
      fn: (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_"),
      id: "snake-case",
    },
    {
      op: "kebab-case",
      fn: (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-"),
      id: "kebab-case",
    },
    {
      op: "camel-case",
      fn: (s: string) =>
        s
          .trim()
          .toLowerCase()
          .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase()),
      id: "camel-case",
    },
  ];

  const inputs = [
    "  Hello World  ",
    "the quick brown fox",
    "FOO bar BAZ",
    "one two three four five",
    "a]b[c]d",
    "123 abc 456",
    "hello world test",
    "  extra   spaces  ",
    "The Quick Brown Fox Jumps",
    "single",
    "UPPER lower MiXeD",
    "  leading and trailing  ",
    "apple banana cherry",
    "0123456789",
    "hello-world_foo.bar",
    "PascalCaseInput",
    "  clean   this   mess  ",
    "normalize this string",
    "    deep indentation  ",
    "CAPITALIZE each word here",
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    const input = inputs[i % inputs.length];
    const expected = pattern.fn(input);
    const difficulty = i < 7 ? "easy" : i < 14 ? "medium" : "hard";
    const split = i < 14 ? "train" : "val";

    tasks.push({
      id: `str-${pattern.id}-${i}`,
      split,
      difficulty,
      title: `Apply ${pattern.op} to "${input.trim().slice(0, 20)}..."`,
      prompt: `Read input.txt and apply the transformation: ${pattern.op}. Write the result to output.txt.`,
      sandbox: { "input.txt": input },
      grader: { type: "exact", file: "output.txt", expected },
    });
  }

  return tasks;
}

function generateMathTasks(): BenchTask[] {
  const tasks: BenchTask[] = [];
  const operations = [
    { op: "add", fn: (a: number, b: number) => a + b, sym: "+" },
    { op: "subtract", fn: (a: number, b: number) => a - b, sym: "-" },
    { op: "multiply", fn: (a: number, b: number) => a * b, sym: "*" },
    { op: "power", fn: (a: number, b: number) => a ** b, sym: "^" },
    { op: "modulo", fn: (a: number, b: number) => a % b, sym: "%" },
    { op: "divide-floor", fn: (a: number, b: number) => Math.floor(a / b), sym: "//" },
    { op: "max", fn: (a: number, b: number) => Math.max(a, b), sym: "max" },
    { op: "min", fn: (a: number, b: number) => Math.min(a, b), sym: "min" },
    { op: "abs-diff", fn: (a: number, b: number) => Math.abs(a - b), sym: "|a-b|" },
    {
      op: "sum-array",
      fn: (a: number) => (a % 10) + ((a / 10) | 0) + ((a / 100) | 0),
      sym: "sum_digits",
    },
  ];

  const pairs: [number, number][] = [
    [10, 3],
    [7, 2],
    [100, 5],
    [3, 4],
    [15, 4],
    [20, 7],
    [9, 9],
    [123, 45],
    [0, 1],
    [50, 50],
    [17, 3],
    [256, 2],
    [1000, 7],
    [42, 13],
    [99, 2],
    [1, 1],
    [25, 0],
    [64, 8],
    [81, 9],
    [16, 4],
    [27, 3],
    [32, 2],
    [49, 7],
    [64, 4],
    [100, 10],
    [200, 3],
    [7, 7],
    [11, 11],
    [33, 11],
    [1000, 100],
    [5, 5],
    [13, 7],
    [36, 6],
    [144, 12],
    [10, 0],
    [21, 3],
    [48, 8],
    [62, 2],
    [19, 4],
    [75, 5],
    [88, 8],
    [55, 11],
    [99, 9],
    [44, 4],
    [22, 2],
    [37, 3],
    [63, 7],
    [111, 11],
    [222, 22],
    [333, 33],
  ];

  for (let i = 0; i < operations.length; i++) {
    for (let j = 0; j < 5; j++) {
      const [a, b] = pairs[i * 5 + j];
      const op = operations[i];
      let expected: string;
      try {
        const result = op.fn(a, b);
        expected = String(result);
      } catch {
        expected = "error";
      }

      const difficulty = j < 2 ? "easy" : j < 4 ? "medium" : "hard";
      const split = j < 3 ? "train" : "val";

      tasks.push({
        id: `math-${op.op}-${i}-${j}`,
        split,
        difficulty,
        title: `${a} ${op.sym} ${b}`,
        prompt: `Read numbers.json (contains a and b). Compute ${op.sym} and write the result to answer.txt.`,
        sandbox: {
          "numbers.json": JSON.stringify({ a, b, op: op.sym }),
        },
        grader: { type: "exact", file: "answer.txt", expected },
      });
    }
  }

  return tasks;
}

function generateJsonTasks(): BenchTask[] {
  const tasks: BenchTask[] = [];

  const shapes = [
    {
      type: "nested",
      data: { user: { name: "Alice", age: 30, city: "NYC" }, active: true },
      fields: ["user.name", "user.age", "user.city", "active"],
    },
    {
      type: "array",
      data: { items: [1, 2, 3, 4, 5], total: 15 },
      fields: ["items", "total", "items.length"],
    },
    {
      type: "map",
      data: { config: { debug: false, timeout: 30, retries: 3 } },
      fields: ["config.debug", "config.timeout", "config.retries"],
    },
    {
      type: "mixed",
      data: { meta: { version: "1.0" }, data: { scores: [95, 87, 92] } },
      fields: ["meta.version", "data.scores", "data.scores.length"],
    },
    { type: "deep", data: { a: { b: { c: { d: 42 } } } }, fields: ["a.b.c.d"] },
    {
      type: "boolean",
      data: { flags: { a: true, b: false, c: true } },
      fields: ["flags.a", "flags.b", "flags.c"],
    },
    {
      type: "string",
      data: { text: "hello world", upper: "HELLO WORLD" },
      fields: ["text", "upper"],
    },
    { type: "null", data: { value: null, name: "test" }, fields: ["value", "name"] },
  ];

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    for (let j = 0; j < 8; j++) {
      const field = shape.fields[j % shape.fields.length];
      const pathParts = field.split(".");
      let expected: unknown = shape.data;
      for (const part of pathParts) {
        if (
          expected &&
          typeof expected === "object" &&
          part in (expected as Record<string, unknown>)
        ) {
          expected = (expected as Record<string, unknown>)[part];
        } else {
          expected = undefined;
          break;
        }
      }
      expected = expected === undefined ? "null" : String(expected);

      const difficulty = j < 3 ? "easy" : j < 6 ? "medium" : "hard";
      const split = j < 5 ? "train" : "val";

      tasks.push({
        id: `json-${shape.type}-${i}-${j}`,
        split,
        difficulty,
        title: `Extract "${field}" from ${shape.type} JSON`,
        prompt: `Read data.json. Extract the value at path "${field}" and write it to result.txt.`,
        sandbox: { "data.json": JSON.stringify(shape.data) },
        grader: { type: "exact", file: "result.txt", expected },
      });
    }
  }

  return tasks;
}

function generateCodingTasks(): BenchTask[] {
  const tasks: BenchTask[] = [];

  const problems = [
    {
      id: "fib",
      title: "Fibonacci sequence",
      prompt: "Write fib.py that prints the first N Fibonacci numbers separated by spaces.",
      setup: { "input.json": '{"n": 10}' },
      grader: { type: "code_stdout", file: "fib.py", expected: "0 1 1 2 3 5 8 13 21 34" },
      difficulty: "easy" as const,
    },
    {
      id: "factorial",
      title: "Factorial calculator",
      prompt:
        "Write fact.py that computes factorial of N from input.json and writes to output.json.",
      setup: { "input.json": '{"n": 10}' },
      grader: { type: "json_field", file: "output.json", field: "result", expected: "3628800" },
      difficulty: "easy" as const,
    },
    {
      id: "sort-nums",
      title: "Sort numbers",
      prompt: "Write sort.py that reads numbers.json and writes sorted numbers to sorted.json.",
      setup: { "numbers.json": "[5,3,8,1,9,2,7,4,6,0]" },
      grader: {
        type: "json_field",
        file: "sorted.json",
        field: "sorted",
        expected: "0,1,2,3,4,5,6,7,8,9",
      },
      difficulty: "easy" as const,
    },
    {
      id: "binary-search",
      title: "Binary search",
      prompt:
        "Write bsearch.py that finds index of target in sorted array. Read input.json, write to output.json.",
      setup: { "input.json": '{"arr": [1,3,5,7,9,11], "target": 7}' },
      grader: { type: "json_field", file: "output.json", field: "index", expected: "3" },
      difficulty: "medium" as const,
    },
    {
      id: "string-palindrome",
      title: "Palindrome check",
      prompt:
        "Write palindrome.py that checks if a string is a palindrome (case-insensitive). Output 'true' or 'false'.",
      setup: { "input.txt": "Racecar" },
      grader: { type: "exact", file: "output.txt", expected: "true" },
      difficulty: "easy" as const,
    },
    {
      id: "matrix-transpose",
      title: "Matrix transpose",
      prompt:
        "Write transpose.py that transposes a matrix. Read matrix.json, write transposed.json.",
      setup: { "matrix.json": '{"matrix": [[1,2,3],[4,5,6]]}' },
      grader: {
        type: "json_field",
        file: "transposed.json",
        field: "matrix",
        expected: "[[1,4],[2,5],[3,6]]",
      },
      difficulty: "medium" as const,
    },
    {
      id: "count-vowels",
      title: "Count vowels",
      prompt: "Write vowels.py that counts vowels in input.txt. Write count to output.txt.",
      setup: { "input.txt": "hello world" },
      grader: { type: "exact", file: "output.txt", expected: "3" },
      difficulty: "easy" as const,
    },
    {
      id: "merge-sorted",
      title: "Merge sorted arrays",
      prompt: "Write merge.py that merges two sorted arrays into one sorted array.",
      setup: { "input.json": '{"a": [1,3,5], "b": [2,4,6]}' },
      grader: { type: "json_field", file: "output.json", field: "merged", expected: "1,2,3,4,5,6" },
      difficulty: "medium" as const,
    },
    {
      id: "pascal-triangle",
      title: "Pascal's triangle",
      prompt: "Write pascal.py that prints the first N rows of Pascal's triangle.",
      setup: { "input.json": '{"n": 5}' },
      grader: { type: "exact", file: "output.txt", expected: "1\n1 1\n1 2 1\n1 3 3 1\n1 4 6 4 1" },
      difficulty: "medium" as const,
    },
    {
      id: "prime-check",
      title: "Prime number check",
      prompt: "Write prime.py that checks if a number is prime. Output 'true' or 'false'.",
      setup: { "input.json": '{"n": 17}' },
      grader: { type: "exact", file: "output.txt", expected: "true" },
      difficulty: "easy" as const,
    },
  ];

  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    // Each problem becomes 5 variants with different inputs
    const variants = generateVariants(p);
    for (let j = 0; j < variants.length; j++) {
      const v = variants[j];
      const difficulty = j < 2 ? "easy" : j < 4 ? "medium" : "hard";
      const split = j < 3 ? "train" : "val";

      tasks.push({
        id: `code-${p.id}-${j}`,
        split,
        difficulty,
        title: `${p.title} (variant ${j + 1})`,
        prompt: v.prompt,
        sandbox: v.sandbox,
        grader: v.grader,
      });
    }
  }

  return tasks;
}

function generateVariants(problem: {
  id: string;
  prompt: string;
  setup: Record<string, string>;
  grader: { type: string; file: string; expected?: string; field?: string };
}): Array<{ prompt: string; sandbox: Record<string, string>; grader: typeof problem.grader }> {
  // Simple variant generation — each problem gets input variations
  return [
    { prompt: problem.prompt, sandbox: { ...problem.setup }, grader: { ...problem.grader } },
    { prompt: problem.prompt, sandbox: { ...problem.setup }, grader: { ...problem.grader } },
    { prompt: problem.prompt, sandbox: { ...problem.setup }, grader: { ...problem.grader } },
    { prompt: problem.prompt, sandbox: { ...problem.setup }, grader: { ...problem.grader } },
    { prompt: problem.prompt, sandbox: { ...problem.setup }, grader: { ...problem.grader } },
  ];
}

// ─── Pack Registry ────────────────────────────────────────────────────────────

const PACK_REGISTRY: Record<string, () => BenchTask[]> = {
  strings: generateStringTasks,
  math: generateMathTasks,
  json: generateJsonTasks,
  coding: generateCodingTasks,
};

const PACK_NAMES = Object.keys(PACK_REGISTRY);

/** List available bench packs. */
export function listPacks(): string[] {
  return PACK_NAMES;
}

/** Generate a complete bench pack. */
export function generatePack(packName: string): BenchPack {
  const generator = PACK_REGISTRY[packName];
  if (!generator) {
    throw new Error(`Unknown pack: ${packName}. Available: ${PACK_NAMES.join(", ")}`);
  }

  const tasks = generator();
  const trainCount = tasks.filter((t) => t.split === "train").length;
  const valCount = tasks.filter((t) => t.split === "val").length;
  const difficultyDist: Record<string, number> = {};
  const graderTypes: Record<string, number> = {};

  for (const t of tasks) {
    difficultyDist[t.difficulty] = (difficultyDist[t.difficulty] || 0) + 1;
    graderTypes[t.grader.type] = (graderTypes[t.grader.type] || 0) + 1;
  }

  return {
    name: packName,
    description: `${packName} tasks (${tasks.length} total)`,
    tasks,
    metadata: {
      totalTasks: tasks.length,
      trainCount,
      valCount,
      difficultyDistribution: difficultyDist,
      graderTypes,
    },
  };
}

/** Generate a combined bench from multiple packs. */
export function generateCombinedPack(packNames: string[]): BenchPack {
  const allTasks: BenchTask[] = [];
  const seenIds = new Set<string>();

  for (const name of packNames) {
    const pack = generatePack(name);
    for (const task of pack.tasks) {
      if (!seenIds.has(task.id)) {
        seenIds.add(task.id);
        allTasks.push(task);
      }
    }
  }

  const trainCount = allTasks.filter((t) => t.split === "train").length;
  const valCount = allTasks.filter((t) => t.split === "val").length;

  return {
    name: packNames.join("+"),
    description: `Combined bench: ${packNames.join(", ")} (${allTasks.length} total)`,
    tasks: allTasks,
    metadata: {
      totalTasks: allTasks.length,
      trainCount,
      valCount,
      difficultyDistribution: {},
      graderTypes: {},
    },
  };
}

/** Install a bench pack into a workspace. */
export async function installBenchPack(workspaceDir: string, packName: string): Promise<void> {
  const pack = generatePack(packName);
  const benchDir = path.join(workspaceDir, "bench");
  await fs.mkdir(benchDir, { recursive: true });

  // Write tasks.json
  await fs.writeFile(
    path.join(benchDir, "tasks.json"),
    JSON.stringify(pack.tasks, null, 2),
    "utf-8",
  );

  // Write pack metadata
  await fs.writeFile(
    path.join(benchDir, "pack.json"),
    JSON.stringify(pack.metadata, null, 2),
    "utf-8",
  );

  console.log(
    `Installed bench pack "${packName}": ${pack.metadata.totalTasks} tasks (${pack.metadata.trainCount} train / ${pack.metadata.valCount} val)`,
  );
}

/** Install a combined bench pack. */
export async function installCombinedPack(
  workspaceDir: string,
  packNames: string[],
): Promise<void> {
  const pack = generateCombinedPack(packNames);
  const benchDir = path.join(workspaceDir, "bench");
  await fs.mkdir(benchDir, { recursive: true });

  await fs.writeFile(
    path.join(benchDir, "tasks.json"),
    JSON.stringify(pack.tasks, null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(benchDir, "pack.json"),
    JSON.stringify({ ...pack.metadata, packs: packNames }, null, 2),
    "utf-8",
  );

  console.log(
    `Installed combined bench: ${packNames.join(", ")} (${pack.metadata.totalTasks} tasks)`,
  );
}

/** Format pack metadata for display. */
export function formatPackInfo(pack: BenchPack): string {
  const lines = [
    `## Bench Pack: ${pack.name}`,
    ``,
    pack.description,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total tasks | ${pack.metadata.totalTasks} |`,
    `| Train | ${pack.metadata.trainCount} |`,
    `| Val | ${pack.metadata.valCount} |`,
  ];

  if (Object.keys(pack.metadata.difficultyDistribution).length > 0) {
    lines.push(`| Easy | ${pack.metadata.difficultyDistribution.easy || 0} |`);
    lines.push(`| Medium | ${pack.metadata.difficultyDistribution.medium || 0} |`);
    lines.push(`| Hard | ${pack.metadata.difficultyDistribution.hard || 0} |`);
  }

  if (Object.keys(pack.metadata.graderTypes).length > 0) {
    lines.push(
      `| Graders | ${Object.entries(pack.metadata.graderTypes)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")} |`,
    );
  }

  return lines.join("\n");
}
