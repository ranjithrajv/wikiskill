// ─── Evolution Prompt ──────────────────────────────────────────────────────────
// Builds the step-by-step instructions for one WikiSkill evolution iteration.
//
// This is the whole "engine": there is no bespoke LLM call here. The prompt is
// handed to whatever coding agent is hosting WikiSkill (OpenCode, Claude Code,
// Codex, ...) and that agent executes the steps itself using its own filesystem
// tools. Any harness that can (a) run an agent on a text prompt and (b) let it
// read/write files can run this loop — that's what makes the format portable.

import { wikiRoot, tracesRoot, skillsRoot } from "./paths.js";
import { benchRoot } from "./bench.js";

/** Build the evolution loop prompt for a given project and iteration. */
export function buildEvolutionPrompt(
  iteration: number,
  projectDir: string,
  sampleSize: number,
  opts: { deepen?: string; editBudget?: number } = {},
): string {
  const raw = tracesRoot(projectDir);
  const wiki = wikiRoot(projectDir);
  const skills = skillsRoot(projectDir);
  const bench = benchRoot(projectDir);
  const budget = opts.editBudget ?? 4;

  const proposerStep = opts.deepen
    ? `## Step 2: Skill Proposer — DEEPEN existing skill \`${opts.deepen}\`
Based on the wiki patterns:
- Check \`${wiki}/skill-impact.md\` to avoid re-proposing failed edits
- You MUST edit \`${skills}/${opts.deepen.replace(/\.md$/, "")}.md\` IN PLACE — do not create a new skill file
- Use surgical edits (change at most 30% of the file, at most ${budget} edits): rewrite only the sections the traces prove are wrong or incomplete, preserve everything else`
    : `## Step 2: Skill Proposer — Propose Skill Update
Based on the wiki patterns:
- Check \`${wiki}/skill-impact.md\` to avoid re-proposing failed edits
- Propose ONE focused skill improvement (at most ${budget} surgical edits, or one new skill under 120 lines)
- Create or update a skill file in \`${skills}/\` with frontmatter
- Each skill should be a SKILL.md-style file with name, description, and workflow steps`;

  return `You are running WikiSkill evolution iteration ${iteration}.

Project directory: ${projectDir}
Sample size for trace analysis: ${sampleSize}
Edit budget for this iteration: ${budget} surgical edits max (textual learning rate — over-budget proposals are rejected by the gate without bench validation)

Execute these steps IN ORDER:

## Step 1: Wiki Maintainer — Analyze Traces
Read the execution traces in \`${raw}/\` and analyze them:
- Identify recurring FAILURE patterns and their root causes
- Identify SUCCESSFUL strategies worth codifying
- For each pattern, create a markdown file in \`${wiki}/patterns/\`
  - Filename: \`<category>-<slug>.md\` (e.g., \`failure-file-not-found.md\`)
  - Include: Category, Description, Actionable, Evidence sections
- Update \`${wiki}/index.md\` with all current patterns
- Append a timestamped entry to \`${wiki}/logs.md\`

Tip: for large trace pools, run \`npx wikiskill analysts\` first — it splits
traces into parallel error/success analyst batches (fleet mode). Execute the
printed batch prompts, save each analyst's \`\`\`wikiskill-patch output as a
file under \`.wikiskill/patches/\`, then run \`npx wikiskill consolidate\` to
merge them into one update before Step 2.

${proposerStep}

## Step 3: Validate — do NOT self-score
Run \`npx wikiskill validate\`. This is a real held-out gate, not a self-report:
it runs every task in \`${bench}/<task-id>/\` headlessly with your
proposed skill installed, scores the pass rate (R_val), and accepts only if
R_val is strictly better than the best score seen so far (R_best) — otherwise
it rolls the skill back automatically. It also appends the real outcome to
\`${wiki}/skill-impact.md\` and closes out this iteration for you (Steps 4-5
below happen inside \`validate\`, not by hand).

If \`validate\` reports no bench tasks are configured yet, there is nothing to
gate this iteration — leave the proposed skill as-is and mention to the user
that adding tasks under \`.wikiskill/bench/<task-id>/{task.md,verify}\` would
let it validate for real next time.

## Step 4: Record Impact (handled by \`validate\`)
## Step 5: Clean Up (handled by \`validate\`)

Do not edit \`${wiki}/skill-impact.md\` yourself, and do not run \`wikiskill evolve-complete\`
after a successful \`validate\` — it already did that.`;
}

/** Build the status report text for a given project's evolution state. */
export function buildStatusText(params: {
  iteration: number;
  maxIterations: number;
  bestScore: number;
  patternCount: number;
  totalTraces: number;
  sessions: number;
  successRate: number;
  accepted: number;
  rejected: number;
  recentPatterns: Array<{ title: string; category: string }>;
  logTail: string;
}): string {
  return [
    `## WikiSkill Status`,
    ``,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Iteration | ${params.iteration}/${params.maxIterations} |`,
    `| Best Score | ${params.bestScore.toFixed(3)} |`,
    `| Patterns | ${params.patternCount} |`,
    `| Traces | ${params.totalTraces} (${params.sessions} sessions) |`,
    `| Success Rate | ${(params.successRate * 100).toFixed(1)}% |`,
    `| Proposals Accepted | ${params.accepted} |`,
    `| Proposals Rejected | ${params.rejected} |`,
    ``,
    `### Recent Patterns`,
    ...params.recentPatterns.map((p) => `- **${p.title}** (${p.category})`),
    ``,
    `### Evolution Log (last 500 chars)`,
    params.logTail.slice(-500),
  ].join("\n");
}
