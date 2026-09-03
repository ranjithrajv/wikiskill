// ─── Compare: paired statistical comparison ────────────────────────────────────
// Answers "did the skill actually help?" with a two-sided exact-binomial
// p-value. Per-task win/loss/tie between two workspace runs.

export interface CompareTaskResult {
  taskId: string;
  scoreA: number;
  scoreB: number;
}

export interface CompareResult {
  total: number;
  wins: number;
  losses: number;
  ties: number;
  pValue: number;
  significant: boolean;
  details: { taskId: string; scoreA: number; scoreB: number; winner: "A" | "B" | "tie" }[];
}

/** Two-sided exact binomial p-value. */
function binomialPValue(wins: number, n: number): number {
  if (n === 0) return 1;
  // P(X >= wins) + P(X <= n - wins) for two-sided test
  let p = 0;
  for (let k = wins; k <= n; k++) {
    p += binomialCoefficient(n, k) * Math.pow(0.5, n);
  }
  for (let k = 0; k <= n - wins; k++) {
    p += binomialCoefficient(n, k) * Math.pow(0.5, n);
  }
  return Math.min(p, 1);
}

function binomialCoefficient(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

/** Compare two sets of task results. */
export function compareResults(
  resultsA: Map<string, number>,
  resultsB: Map<string, number>,
): CompareResult {
  const details: CompareResult["details"] = [];
  let wins = 0;
  let losses = 0;
  let ties = 0;

  const allTaskIds = new Set([...resultsA.keys(), ...resultsB.keys()]);

  for (const taskId of allTaskIds) {
    const scoreA = resultsA.get(taskId) ?? 0;
    const scoreB = resultsB.get(taskId) ?? 0;

    let winner: "A" | "B" | "tie";
    if (scoreA > scoreB) {
      wins++;
      winner = "A";
    } else if (scoreB > scoreA) {
      losses++;
      winner = "B";
    } else {
      ties++;
      winner = "tie";
    }

    details.push({ taskId, scoreA, scoreB, winner });
  }

  const decisive = wins + losses;
  const pValue = decisive > 0 ? binomialPValue(Math.max(wins, losses), decisive) : 1;

  return {
    total: allTaskIds.size,
    wins,
    losses,
    ties,
    pValue,
    significant: pValue < 0.05,
    details,
  };
}

/** Format comparison result as human-readable text. */
export function formatCompareResult(result: CompareResult): string {
  const lines = [
    "## Compare Results",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total tasks | ${result.total} |`,
    `| A wins | ${result.wins} |`,
    `| B wins | ${result.losses} |`,
    `| Ties | ${result.ties} |`,
    `| p-value | ${result.pValue.toFixed(4)} |`,
    `| Significant (p < 0.05) | ${result.significant ? "✅ Yes" : "❌ No"} |`,
    "",
    "### Per-Task Breakdown",
    "",
    `| Task | A | B | Winner |`,
    `|------|---|---|--------|`,
    ...result.details.map(
      (d) =>
        `| ${d.taskId} | ${d.scoreA.toFixed(2)} | ${d.scoreB.toFixed(2)} | ${d.winner.toUpperCase()} |`,
    ),
  ];

  return lines.join("\n");
}
