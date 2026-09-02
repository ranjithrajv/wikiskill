// ─── Evolution Prompt ──────────────────────────────────────────────────────────
// Builds the step-by-step instructions for one WikiSkill evolution iteration.
//
// This is the whole "engine": there is no bespoke LLM call here. The prompt is
// handed to whatever coding agent is hosting WikiSkill (OpenCode, Claude Code,
// Codex, ...) and that agent executes the steps itself using its own filesystem
// tools. Any harness that can (a) run an agent on a text prompt and (b) let it
// read/write files can run this loop — that's what makes the format portable.

import { wikiRoot, tracesRoot, skillsRoot } from "./paths.js";

/** Build the evolution loop prompt for a given project and iteration. */
export function buildEvolutionPrompt(
  iteration: number,
  projectDir: string,
  sampleSize: number,
): string {
  const raw = tracesRoot(projectDir);
  const wiki = wikiRoot(projectDir);
  const skills = skillsRoot(projectDir);

  return `You are running WikiSkill evolution iteration ${iteration}.

Project directory: ${projectDir}
Sample size for trace analysis: ${sampleSize}

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

## Step 2: Skill Proposer — Propose Skill Update
Based on the wiki patterns:
- Check \`${wiki}/skill-impact.md\` to avoid re-proposing failed edits
- Propose ONE focused skill improvement
- Create or update a skill file in \`${skills}/\` with frontmatter
- Each skill should be a SKILL.md-style file with name, description, and workflow steps

## Step 3: Validation Self-Check
Evaluate your proposed skill against the wiki patterns:
- Does it address a documented failure pattern?
- Are instructions concrete and actionable?
- Is it more than a trivial change?

## Step 4: Record Impact
Append a row to \`${wiki}/skill-impact.md\`:
\`| ${iteration} | <skill-name> | <score> | <best> | <accepted|rejected> |\`

## Step 5: Clean Up
Prune old trace files in \`${raw}/\`, keeping only the 3 most recent batches.

Work autonomously through all steps. Use the filesystem tools to read and write files.`;
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
