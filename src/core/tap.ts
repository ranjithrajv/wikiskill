// ─── Skills Tap: installable distilled patterns ────────────────────────────────
// Patterns distilled from live evolution runs, installable as skills.
// Compatible with the agentskills.io specification.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface TapSkill {
  id: string;
  name: string;
  description: string;
  paperLayer: "wiki_pattern" | "framework_meta";
  content: string;
}

/**
 * The skills tap — distilled patterns from live evolution runs.
 * These are the *maintainer's* distilled patterns from real graded runs,
 * installable as standard SKILL.md files.
 */
export const SKILLS_TAP: TapSkill[] = [
  {
    id: "search-miss-binary",
    name: "Search Miss Binary Files",
    description: "ripgrep silently skips binary files — verify empty results manually",
    paperLayer: "wiki_pattern",
    content: `---
name: Search Miss Binary Files
description: When search returns no results, verify the file isn't being skipped as binary
---

## Pattern

ripgrep and similar tools silently skip binary files. When a search returns unexpectedly empty results:

1. Check if the target file is binary: \`file <path>\`
2. If binary, use \`strings <path> | grep <pattern>\` or \`grep -a <pattern> <path>\`
3. Document the binary skip in your wiki patterns

## Evidence

Distilled from live WikiSkill evolution runs where the maintainer caught the agent missing content in binary files.
`,
  },
  {
    id: "script-exec-blocked",
    name: "Script Execution Blocked",
    description: "Sandbox approval policy: use file tools, not inline script execution",
    paperLayer: "wiki_pattern",
    content: `---
name: Script Execution Blocked
description: In sandboxed environments, use file tools instead of inline script execution
---

## Pattern

Many sandboxed environments block inline script execution (\`python3 -c\`, \`node -e\`, etc.):

1. Write the script to a file first
2. Execute the file: \`python3 script.py\`
3. If execution is blocked, check sandbox approval policy
4. Use file read/write tools as fallback

## Evidence

Distilled from live WikiSkill evolution runs where the proposer's \`execute_code\` tool was blocked by sandbox policy.
`,
  },
  {
    id: "spec-literal-execution",
    name: "Spec Literal Execution",
    description: "Apply only the spec's literal clauses — no hidden transforms",
    paperLayer: "wiki_pattern",
    content: `---
name: Spec Literal Execution
description: Follow specs literally — don't add hidden transformations not specified
---

## Pattern

When following a specification:

1. Apply ONLY what the spec explicitly states
2. Do NOT add extra formatting, sorting, or transformations unless specified
3. Do NOT add trailing newlines unless specified
4. If the spec says "exact match", produce byte-identical output
5. Re-read the spec before finalizing output

## Evidence

Distilled from live WikiSkill evolution runs where the agent added unsorted transforms that broke exact-match grading.
`,
  },
  {
    id: "verify-output-readback",
    name: "Verify Output Readback",
    description: "Re-read the deliverable file before finishing to verify correctness",
    paperLayer: "wiki_pattern",
    content: `---
name: Verify Output Readback
description: Always re-read your output file before declaring the task complete
---

## Pattern

Before finishing any task that produces a deliverable file:

1. Re-read the output file: \`cat output.txt\`
2. Verify it matches the expected format
3. Check for trailing whitespace or newlines
4. Validate against the grader's expected format
5. Fix any discrepancies before submitting

## Evidence

Distilled from live WikiSkill evolution runs where the agent's output had subtle formatting errors caught only by readback.
`,
  },
  {
    id: "trace-harness-launch-failure",
    name: "Trace Harness Launch Failure",
    description: "Empty traces indicate launch failure, not agent behavior",
    paperLayer: "wiki_pattern",
    content: `---
name: Trace Harness Launch Failure
description: When execution traces are empty, suspect harness launch failure rather than agent behavior
---

## Pattern

If an execution trace is empty or truncated:

1. Check if the harness launched successfully
2. Verify the agent process didn't crash on startup
3. Look for timeout indicators
4. Check system resources (memory, CPU)
5. Do NOT grade empty traces as agent failures — they're infrastructure failures

## Evidence

Distilled from live WikiSkill evolution runs where dead agent sessions were phantom-graded against stale sandboxes.
`,
  },
];

/** Get all available tap skills. */
export function getTapSkills(): TapSkill[] {
  return SKILLS_TAP;
}

/** Get a tap skill by ID. */
export function getTapSkill(id: string): TapSkill | undefined {
  return SKILLS_TAP.find((s) => s.id === id);
}

/** Install a tap skill to a target directory. */
export async function installTapSkill(
  skillId: string,
  targetDir: string,
  overwrite = false,
): Promise<{ success: boolean; message: string }> {
  const skill = getTapSkill(skillId);
  if (!skill) {
    return {
      success: false,
      message: `Skill "${skillId}" not found in tap. Available: ${SKILLS_TAP.map((s) => s.id).join(", ")}`,
    };
  }

  await fs.mkdir(targetDir, { recursive: true });
  const dest = path.join(targetDir, `${skill.id}.md`);

  if (existsSync(dest) && !overwrite) {
    return {
      success: false,
      message: `Skill already exists at ${dest}. Use --overwrite to replace.`,
    };
  }

  await fs.writeFile(dest, skill.content, "utf-8");
  return { success: true, message: `Installed ${skill.id} to ${dest}` };
}

/** Install all tap skills to a target directory. */
export async function installAllTapSkills(
  targetDir: string,
  overwrite = false,
): Promise<{ installed: string[]; skipped: string[] }> {
  const installed: string[] = [];
  const skipped: string[] = [];

  for (const skill of SKILLS_TAP) {
    const result = await installTapSkill(skill.id, targetDir, overwrite);
    if (result.success) {
      installed.push(skill.id);
    } else {
      skipped.push(skill.id);
    }
  }

  return { installed, skipped };
}

/** Format tap skills list for display. */
export function formatTapSkills(): string {
  const lines = [
    "## Skills Tap — Distilled Patterns",
    "",
    "Patterns distilled from live evolution runs, installable as standard SKILL.md.",
    "",
    `| ID | Name | Layer | Description |`,
    `|----|------|-------|-------------|`,
    ...SKILLS_TAP.map((s) => `| ${s.id} | ${s.name} | ${s.paperLayer} | ${s.description} |`),
    "",
    "### Install",
    "",
    "```sh",
    ...SKILLS_TAP.map((s) => `wikiskill tap install ${s.id}`),
    "```",
  ];

  return lines.join("\n");
}
