// ─── Skill Proposer ────────────────────────────────────────────────────────────
// The Wiki-Informed Skill Proposer: uses the wiki and traces to propose
// skill updates via a ReAct-style agent.
//
// From the paper (§3.2.3):
//   "The Proposer operates in a multi-turn ReAct style. It is initially
//    provided with the wiki index, the historical skill impact tracker,
//    and a concise summary of all training task outcomes."
//
// In OpenCode, this generates a prompt for an LLM that:
// 1. Reads the wiki index and skill impact history
// 2. Uses read_file to inspect specific patterns and raw traces on demand
// 3. Produces a concrete skill proposal (markdown content for a SKILL.md file)

import { wikiRoot, ensureWiki, readSkillImpact } from "./wiki-manager.js";
import { tracesRoot, readTraces } from "./trace-capture.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/** Build the system prompt for the Skill Proposer agent. */
function buildProposerPrompt(
  wikiIndex: string,
  skillImpact: string,
  currentSkills: string,
): string {
  return `You are the Skill Proposer for WikiSkill — an autonomous agent that evolves procedural skills using insights from the persistent wiki.

## Your Role
You propose concrete, actionable skill updates (or new skills) based on wiki patterns and execution traces. You operate in a ReAct style: reason about what needs to change, inspect evidence, then produce a proposal.

## Current Wiki Index
${wikiIndex || "_No patterns yet._"}

## Skill Impact History
${skillImpact || "_No history yet._"}

## Current Skills
${currentSkills || "_No skills exist yet._"}

## Instructions
1. Review the wiki index to understand recurring patterns (failures and successes).
2. Check skill-impact.md to see which past proposals succeeded or failed.
3. Use read_file to inspect specific wiki/patterns/*.md files and raw traces.
4. Propose exactly ONE of:
   - **New skill**: Create a SKILL.md file with frontmatter and procedural instructions
   - **Edit existing skill**: Provide a patch that modifies an existing skill
5. Each proposal must target a single, focused improvement.
6. Avoid re-proposing edits that were previously rejected.

## Proposal Output Format
Output your proposal in this exact format:

\`\`\`wikiskill-proposal
action: create | edit
target: <skill-name> (for create) | <existing-skill-id> (for edit)
content:
<full content of SKILL.md or the complete modified SKILL.md>
\`\`\`

## Skill File Format
\`\`\`markdown
---
name: <Skill Name>
description: <What this skill enables>
---

## Workflow
1. <Step-by-step procedure>
2. <Each step should be concrete and actionable>
3. <Reference wiki patterns that motivated this skill>

## Key Patterns
- <Which wiki patterns this skill addresses>
\`\`\`

## Rules
- Each proposal targets exactly ONE skill.
- Skills must be concise but complete.
- Reference specific wiki patterns that motivated the change.
- Be specific about failure workarounds, not generic advice.
- If no meaningful improvement is possible, output: \`wikiskill-proposal: none\``;
}

/** Build the user prompt with task context. */
function buildProposerTaskPrompt(iteration: number, trainingSummary: string): string {
  return `## Skill Evolution — Iteration ${iteration}

Based on the wiki patterns, skill impact history, and training outcomes below, propose a skill update.

### Training Task Summary
${trainingSummary || "_No training summary available._"}

### What to do
1. Review wiki/patterns/ for recurring failure modes and success strategies.
2. Check wiki/skill-impact.md for what has worked (and failed) before.
3. Read raw traces in raw/ to understand specific failure cases.
4. Propose ONE focused skill improvement that addresses the most impactful pattern.

### Critical constraints
- Do NOT propose an edit that was rejected in a previous iteration.
- Focus on the pattern with the highest expected impact.
- Keep skills concise — aim for under 300 words per SKILL.md.`;
}

/**
 * Build the Skill Proposer task prompts.
 */
export async function buildProposerTask(
  projectDir: string,
  iteration: number,
  skillsDir: string,
): Promise<{ prompt: string; systemPrompt: string }> {
  const wikiR = wikiRoot(projectDir);
  await ensureWiki(wikiR);

  // Read wiki state
  const skillImpact = await readSkillImpact(wikiR);

  // Read wiki index (it's a markdown file)
  let wikiIndex = "";
  try {
    wikiIndex = await fs.readFile(path.join(wikiR, "index.md"), "utf-8");
  } catch {
    wikiIndex = "_No wiki index yet._";
  }

  // Read current skills
  let currentSkills = "";
  try {
    const skillFiles = await fs.readdir(skillsDir);
    for (const file of skillFiles) {
      if (file.endsWith(".md")) {
        const content = await fs.readFile(path.join(skillsDir, file), "utf-8");
        currentSkills += `\n### ${file}\n${content}\n`;
      }
    }
  } catch {
    currentSkills = "_No skills directory yet._";
  }

  // Build training summary from recent traces
  const traceDir = tracesRoot(projectDir);
  const traces = await readTraces(traceDir, 30);
  const trainingSummary = buildTrainingSummary(traces);

  return {
    systemPrompt: buildProposerPrompt(wikiIndex, skillImpact, currentSkills),
    prompt: buildProposerTaskPrompt(iteration, trainingSummary),
  };
}

/**
 * Parse a skill proposal from the LLM's output.
 * Returns the proposed skill content, or null if no proposal.
 */
export function parseProposal(output: string): {
  action: "create" | "edit";
  target: string;
  content: string;
} | null {
  const proposalMatch = output.match(/```wikiskill-proposal\s*\n([\s\S]*?)\n```/);
  if (!proposalMatch) {
    // Check for explicit "none"
    if (output.includes("wikiskill-proposal: none")) return null;
    return null;
  }

  const body = proposalMatch[1];
  const actionMatch = body.match(/action:\s*(create|edit)/i);
  const targetMatch = body.match(/target:\s*(.+)/i);
  const contentMatch = body.match(/content:\s*\n([\s\S]*)/);

  if (!actionMatch || !targetMatch || !contentMatch) return null;

  return {
    action: actionMatch[1].toLowerCase() as "create" | "edit",
    target: targetMatch[1].trim(),
    content: contentMatch[1].trim(),
  };
}

/**
 * Apply a parsed proposal to the skills directory.
 */
export async function applyProposal(
  skillsDir: string,
  proposal: { action: "create" | "edit"; target: string; content: string },
): Promise<string> {
  await fs.mkdir(skillsDir, { recursive: true });

  if (proposal.action === "create") {
    const filename = `${slugify(proposal.target)}.md`;
    await fs.writeFile(path.join(skillsDir, filename), proposal.content, "utf-8");
    return filename.replace(/\.md$/, "");
  } else {
    // Edit existing skill — find it
    const files = await fs.readdir(skillsDir);
    const target = files.find(
      (f: string) =>
        f.endsWith(".md") && (f.replace(/\.md$/, "") === proposal.target || f === proposal.target),
    );
    if (!target) throw new Error(`Skill not found: ${proposal.target}`);
    // Backup the current version
    const backupPath = path.join(skillsDir, `${target}.bak`);
    const currentContent = await fs.readFile(path.join(skillsDir, target), "utf-8");
    await fs.writeFile(backupPath, currentContent, "utf-8");
    // Write the new version
    await fs.writeFile(path.join(skillsDir, target), proposal.content, "utf-8");
    return proposal.target;
  }
}

/** Build a concise training summary from traces. */
function buildTrainingSummary(traces: ReturnType<typeof Array.prototype.filter>[number]): string {
  if (!traces.length) return "_No traces available._";

  const byTool = new Map<string, { success: number; fail: number }>();
  for (const t of traces) {
    const entry = byTool.get(t.tool) ?? { success: 0, fail: 0 };
    if (t.status === "completed") entry.success++;
    else entry.fail++;
    byTool.set(t.tool, entry);
  }

  const lines = [`Total: ${traces.length} traces`];
  for (const [tool, stats] of byTool) {
    lines.push(
      `- ${tool}: ${stats.success} success, ${stats.fail} fail (${((stats.success / (stats.success + stats.fail)) * 100).toFixed(0)}% success rate)`,
    );
  }
  return lines.join("\n");
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
