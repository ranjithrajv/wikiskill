// ─── Bounded Update (textual learning rate) ────────────────────────────────────
// SkillOpt's proven fix for destructive rewrites (arXiv:2605.23904): treat the
// skill document as trainable state and bound how far one iteration may move
// it — a per-step edit budget (the "textual learning rate" Lt, cosine-decayed
// with floor 2) plus a line-fraction cap per file. Small, validation-gated
// steps keep consecutive revisions close enough that the impact history stays
// a meaningful optimization signal instead of noise from wholesale rewrites.
//
// Two enforcement points:
//   1. Prompt-level: the proposer is instructed to emit surgical add/delete/
//      replace edits (```wikiskill-edits) instead of full-file rewrites.
//   2. Gate-level: `wikiskill validate` measures the actual diff (current file
//      vs the .bak the proposer left behind, or whole-file size for creates)
//      and rejects over-budget proposals before running the bench.

import * as fs from "node:fs/promises";
import * as path from "node:path";

/** One surgical edit to a skill document. */
export interface EditOp {
  op: "add" | "delete" | "replace";
  /** Target `## Section` heading (case-insensitive); ignored for `add`. */
  section: string;
  /** New section body (add/replace). Section heading itself is preserved. */
  content?: string;
  /** Why this edit helps — recorded, not applied. */
  rationale?: string;
}

export interface TextualLR {
  /** Max edits applied per iteration (Lt). */
  maxEdits: number;
  /** Max fraction of a file's lines one iteration may change (edits). */
  maxEditFraction: number;
  /** Max lines for a newly created skill file. */
  maxNewLines: number;
}

export const DEFAULT_TEXTUAL_LR: TextualLR = {
  maxEdits: 4,
  maxEditFraction: 0.3,
  maxNewLines: 120,
};

/**
 * Cosine-decayed edit budget Lt for an iteration (1-based): starts at
 * `base`, decays to `floor` by maxIterations. Mirrors SkillOpt's schedule
 * (Lt=4, cosine decay, floor 2).
 */
export function learningRateFor(
  iteration: number,
  maxIterations: number,
  base = DEFAULT_TEXTUAL_LR.maxEdits,
  floor = 2,
): number {
  if (maxIterations <= 1) return base;
  const t = Math.min(Math.max(iteration - 1, 0), maxIterations - 1) / (maxIterations - 1);
  const decayed = floor + (base - floor) * (1 + Math.cos(Math.PI * t)) * 0.5;
  return Math.max(floor, Math.round(decayed));
}

/**
 * Parse ```wikiskill-edits blocks from LLM output. Entries are separated by
 * lines containing only `---`:
 *
 * ```wikiskill-edits
 * op: replace
 * section: Workflow
 * content:
 * 1. Do the thing first
 * ---
 * op: add
 * section: (new section appended at end)
 * content:
 * ## Pitfalls
 * - Don't do the other thing
 * ```
 */
export function parseEditOps(output: string): EditOp[] {
  const match = output.match(/```wikiskill-edits\s*\n([\s\S]*?)\n```/);
  if (!match) return [];
  const edits: EditOp[] = [];
  for (const entry of match[1].split(/^\s*---\s*$/m)) {
    const opMatch = entry.match(/op:\s*(add|delete|replace)/i);
    if (!opMatch) continue;
    const op = opMatch[1].toLowerCase() as EditOp["op"];
    const section = entry.match(/section:\s*(.+)/i)?.[1]?.trim() ?? "";
    const contentMatch = entry.match(/content:\s*\n([\s\S]*)/);
    const content = contentMatch?.[1]?.trim() || undefined;
    const rationale = entry.match(/rationale:\s*(.+)/i)?.[1]?.trim();
    edits.push({ op, section, content, rationale });
  }
  return edits;
}

/** Drop exact-duplicate edits (same op + section + content), keeping order. */
export function dedupeEdits(edits: EditOp[]): EditOp[] {
  const seen = new Set<string>();
  return edits.filter((e) => {
    const key = `${e.op}|${e.section.toLowerCase()}|${e.content ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Keep the first `budget` edits — the proposer's ranking order is preserved. */
export function clipEdits(edits: EditOp[], budget: number): EditOp[] {
  return edits.slice(0, Math.max(0, budget));
}

/** Split markdown into [heading-line-or-null, body] blocks on ## headings. */
function splitSections(content: string): Array<{ heading: string | null; body: string[] }> {
  const sections: Array<{ heading: string | null; body: string[] }> = [];
  let current: { heading: string | null; body: string[] } = { heading: null, body: [] };
  for (const line of content.split("\n")) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      sections.push(current);
      current = { heading: h[1], body: [] };
    } else {
      current.body.push(line);
    }
  }
  sections.push(current);
  return sections;
}

function renderSections(sections: Array<{ heading: string | null; body: string[] }>): string {
  return sections
    .map((s) => (s.heading ? [`## ${s.heading}`, ...s.body].join("\n") : s.body.join("\n")))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/**
 * Pure string transform: apply surgical edits to skill content. Pure so it is
 * unit-testable and previewable before touching the filesystem.
 */
export function applyEditsToContent(content: string, edits: EditOp[]): string {
  let sections = splitSections(content);
  for (const edit of edits) {
    if (edit.op === "add") {
      sections.push({ heading: null, body: [(edit.content ?? "").trim()] });
      continue;
    }
    const idx = sections.findIndex(
      (s) => s.heading !== null && s.heading.toLowerCase() === edit.section.toLowerCase(),
    );
    if (idx === -1) continue; // unknown section — skip, never fabricate
    if (edit.op === "delete") {
      sections.splice(idx, 1);
    } else if (edit.content !== undefined) {
      sections[idx] = { heading: sections[idx].heading, body: [edit.content.trim()] };
    }
  }
  return renderSections(sections) + "\n";
}

/**
 * Apply surgical edits to a skill file on disk, leaving a .bak backup (the
 * same backup convention `applyProposal` uses, so `rollbackSkill` works).
 * Returns the number of edits that matched a section.
 */
export async function applyEditOps(
  skillsDir: string,
  skillId: string,
  edits: EditOp[],
): Promise<{ applied: number; skipped: number }> {
  const targetFile = path.join(skillsDir, `${skillId}.md`);
  let current: string;
  try {
    current = await fs.readFile(targetFile, "utf-8");
  } catch {
    throw new Error(`Skill not found: ${skillId}`);
  }
  await fs.writeFile(path.join(skillsDir, `${skillId}.md.bak`), current, "utf-8");

  let applied = 0;
  let skipped = 0;
  let sections = splitSections(current);
  for (const edit of edits) {
    if (edit.op === "add") {
      sections.push({ heading: null, body: [(edit.content ?? "").trim()] });
      applied++;
      continue;
    }
    const idx = sections.findIndex(
      (s) => s.heading !== null && s.heading.toLowerCase() === edit.section.toLowerCase(),
    );
    if (idx === -1) {
      skipped++;
      continue;
    }
    if (edit.op === "delete") sections.splice(idx, 1);
    else if (edit.content !== undefined)
      sections[idx] = { heading: sections[idx].heading, body: [edit.content.trim()] };
    applied++;
  }
  await fs.writeFile(targetFile, renderSections(sections) + "\n", "utf-8");
  return { applied, skipped };
}

/** Multiset line diff size between two file contents. */
export function lineDiffCount(before: string, after: string): number {
  const counts = new Map<string, number>();
  for (const line of before.split("\n")) counts.set(line, (counts.get(line) ?? 0) + 1);
  let diff = 0;
  for (const line of after.split("\n")) {
    const n = counts.get(line) ?? 0;
    if (n > 0) counts.set(line, n - 1);
    else diff++;
  }
  for (const n of counts.values()) diff += n;
  return diff;
}

/** Fraction of lines changed, in [0, 1]: multiset line diff over the total
 * lines on both sides. 0 = identical, 1 = fully replaced, pure appends of N
 * lines to a B-line file score N/(2B+N). */
export function editFraction(before: string, after: string): number {
  const total = before.split("\n").length + after.split("\n").length;
  return lineDiffCount(before, after) / Math.max(total, 1);
}

export interface BudgetCheck {
  within: boolean;
  violations: string[];
}

/**
 * Gate-level enforcement for `wikiskill validate`: measure the real diff.
 * Edited skills (with .bak) are checked by line-fraction; newly created
 * skills by total line count. Rejected proposals should be rolled back by
 * the caller.
 */
export async function enforceEditBudget(
  skillsDir: string,
  changedIds: string[],
  lr: TextualLR = DEFAULT_TEXTUAL_LR,
): Promise<BudgetCheck> {
  const violations: string[] = [];
  for (const id of changedIds) {
    const targetFile = path.join(skillsDir, `${id}.md`);
    const backupFile = path.join(skillsDir, `${id}.md.bak`);
    let current: string;
    try {
      current = await fs.readFile(targetFile, "utf-8");
    } catch {
      continue;
    }
    let backup: string | null = null;
    try {
      backup = await fs.readFile(backupFile, "utf-8");
    } catch {
      backup = null;
    }
    if (backup === null) {
      const lines = current.split("\n").length;
      if (lines > lr.maxNewLines) {
        violations.push(
          `${id}: new skill is ${lines} lines (budget: max ${lr.maxNewLines} lines) — split it or deepen an existing skill instead`,
        );
      }
    } else {
      const frac = editFraction(backup, current);
      if (frac > lr.maxEditFraction) {
        violations.push(
          `${id}: changed ${(frac * 100).toFixed(0)}% of lines (budget: max ${(lr.maxEditFraction * 100).toFixed(0)}%) — use smaller surgical edits`,
        );
      }
    }
  }
  return { within: violations.length === 0, violations };
}
