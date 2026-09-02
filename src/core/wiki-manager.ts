// ─── Wiki Manager ──────────────────────────────────────────────────────────────
// Manages the Wiki Layer: the persistent, compounding knowledge base.
// All operations are filesystem-based (markdown files) following the WikiSkill
// paper's design: patterns/, logs.md, skill-impact.md, index.md.
//
// The wiki NEVER rolls back — even if a skill change is rejected, the
// accumulated knowledge persists so future iterations can build on it.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { WikiPattern, SkillImpactRecord } from "./types.js";

/** Resolve the wiki root directory for a given project. */
export function wikiRoot(projectDir: string): string {
  return path.join(projectDir, ".opencode", "wikiskill", "wiki");
}

/** Ensure all wiki directories exist. */
export async function ensureWiki(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "patterns"), { recursive: true });
  // Create initial files if they don't exist
  await ensureFile(
    path.join(root, "index.md"),
    "# Wiki Index\n\n_Patterns catalog — updated by the Wiki Maintainer._\n",
  );
  await ensureFile(
    path.join(root, "logs.md"),
    "# Evolution Log\n\n_Iteration history — entries appended by the Wiki Maintainer._\n",
  );
  await ensureFile(
    path.join(root, "skill-impact.md"),
    "# Skill Impact Tracker\n\n_Acceptance history — updated programmatically after gating._\n\n| Iter | Target Skill | Score | Best | Outcome |\n|------|-------------|-------|------|---------|\n",
  );
}

async function ensureFile(filePath: string, initial: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, initial, "utf-8");
  }
}

// ─── Pattern CRUD ──────────────────────────────────────────────────────────────

/** List all pattern files in the wiki. */
export async function listPatterns(root: string): Promise<WikiPattern[]> {
  const patternsDir = path.join(root, "patterns");
  try {
    const files = await fs.readdir(patternsDir);
    const patterns: WikiPattern[] = [];
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const content = await fs.readFile(path.join(patternsDir, file), "utf-8");
      const pattern = parsePatternFile(file, content);
      if (pattern) patterns.push(pattern);
    }
    return patterns;
  } catch {
    return [];
  }
}

/** Read a single pattern by ID. */
export async function readPattern(root: string, id: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, "patterns", `${id}.md`), "utf-8");
  } catch {
    return null;
  }
}

/** Write or update a pattern file. */
export async function writePattern(root: string, id: string, content: string): Promise<void> {
  await fs.writeFile(path.join(root, "patterns", `${id}.md`), content, "utf-8");
}

/** Delete a pattern file. */
export async function deletePattern(root: string, id: string): Promise<void> {
  try {
    await fs.unlink(path.join(root, "patterns", `${id}.md`));
  } catch {
    // ignore if not found
  }
}

// ─── Log Operations ────────────────────────────────────────────────────────────

/** Append an entry to the evolution log. */
export async function appendEvolutionLog(root: string, entry: string): Promise<void> {
  const logPath = path.join(root, "logs.md");
  await fs.appendFile(logPath, `\n${entry}\n`, "utf-8");
}

/** Read the full evolution log. */
export async function readEvolutionLog(root: string): Promise<string> {
  try {
    return await fs.readFile(path.join(root, "logs.md"), "utf-8");
  } catch {
    return "";
  }
}

// ─── Skill Impact Tracker ──────────────────────────────────────────────────────

/** Append a skill impact record to skill-impact.md. */
export async function appendSkillImpact(root: string, record: SkillImpactRecord): Promise<void> {
  const impactPath = path.join(root, "skill-impact.md");
  const row = `| ${record.iteration} | ${record.targetSkill} | ${record.validationScore.toFixed(2)} | ${record.bestScore.toFixed(2)} | ${record.outcome} |`;
  await fs.appendFile(impactPath, `${row}\n`, "utf-8");
}

/** Read the full skill impact tracker. */
export async function readSkillImpact(root: string): Promise<string> {
  try {
    return await fs.readFile(path.join(root, "skill-impact.md"), "utf-8");
  } catch {
    return "";
  }
}

// ─── Index Management ──────────────────────────────────────────────────────────

/** Regenerate the wiki index.md from current patterns. */
export async function rebuildIndex(root: string): Promise<void> {
  const patterns = await listPatterns(root);
  const lines = ["# Wiki Index\n", `_Last rebuilt at ${new Date().toISOString()}_\n`];

  const failures = patterns.filter((p) => p.category === "failure");
  const successes = patterns.filter((p) => p.category === "success");
  const strategies = patterns.filter((p) => p.category === "strategy");

  if (failures.length > 0) {
    lines.push("\n## Failure Patterns\n");
    for (const p of failures) lines.push(`- **${p.title}** (\`${p.id}\`) — ${p.description}`);
  }
  if (successes.length > 0) {
    lines.push("\n## Success Patterns\n");
    for (const p of successes) lines.push(`- **${p.title}** (\`${p.id}\`) — ${p.description}`);
  }
  if (strategies.length > 0) {
    lines.push("\n## Strategies\n");
    for (const p of strategies) lines.push(`- **${p.title}** (\`${p.id}\`) — ${p.description}`);
  }

  lines.push(`\n_Total patterns: ${patterns.length}_\n`);
  await fs.writeFile(path.join(root, "index.md"), lines.join("\n"), "utf-8");
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function parsePatternFile(filename: string, content: string): WikiPattern | null {
  const id = filename.replace(/\.md$/, "");
  // Simple frontmatter-like parsing from markdown
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const categoryMatch = content.match(/Category:\s*(failure|success|strategy)/i);

  return {
    id,
    title: titleMatch?.[1] ?? id,
    category: (categoryMatch?.[1]?.toLowerCase() as WikiPattern["category"]) ?? "failure",
    description: extractSection(content, "Description") ?? "",
    actionable: extractSection(content, "Actionable") ?? "",
    evidence: extractListItems(content, "Evidence"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function extractSection(content: string, heading: string): string | null {
  const regex = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = content.match(regex);
  return match?.[1]?.trim() ?? null;
}

function extractListItems(content: string, heading: string): string[] {
  const section = extractSection(content, heading);
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}
