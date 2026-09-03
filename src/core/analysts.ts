// ─── Parallel Analyst Fleet ────────────────────────────────────────────────────
// Trace2Skill's speedup (arXiv:2603.25158): instead of one sequential pass
// over traces, dispatch a fleet of analyst sub-agents over disjoint trace
// batches — error batches go to a ReAct-style error analyst (inspects
// artifacts, validates fixes), success batches to a single-pass success
// analyst (extracts reusable behavior) — then hierarchically consolidate all
// patch proposals into one coherent skill update.
//
// Core stays LLM-call-free (this repo's engine is prompt-text + filesystem):
// this module splits batches, builds per-batch analyst prompts, parses
// ```wikiskill-patch blocks, and deterministically consolidates them
// (group by target skill, dedupe, preserve conflicts as alternatives).
// The CLI (`wikiskill analysts`, `wikiskill consolidate`) wires the fleet:
// print N batch prompts for the hosting agent to execute in parallel, then
// merge whatever patch files it produces.

import type { TraceEntry } from "./types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export type AnalystRole = "error" | "success";

/** One disjoint batch of traces for a single analyst. */
export interface TraceBatchInput {
  batchId: number;
  role: AnalystRole;
  traces: TraceEntry[];
}

/**
 * Split traces into error/success pools, then chunk each pool into batches
 * of at most `batchSize`. Error batches come first (failures drive skill
 * evolution; cf. paper §C stratified 5-fail/3-pass sampling).
 */
export function splitTraceBatches(traces: TraceEntry[], batchSize = 8): TraceBatchInput[] {
  const size = Math.max(1, batchSize);
  const errors = traces.filter((t) => t.status === "error");
  const successes = traces.filter((t) => t.status !== "error");
  const batches: TraceBatchInput[] = [];
  let id = 0;
  for (let i = 0; i < errors.length; i += size) {
    batches.push({ batchId: id++, role: "error", traces: errors.slice(i, i + size) });
  }
  for (let i = 0; i < successes.length; i += size) {
    batches.push({ batchId: id++, role: "success", traces: successes.slice(i, i + size) });
  }
  return batches;
}

function summarizeTrace(t: TraceEntry, i: number): string {
  const clip = (v: unknown, n: number): string => {
    const s = JSON.stringify(v) ?? "";
    return s.length > n ? s.slice(0, n - 3) + "..." : s;
  };
  return (
    `[Trace ${i + 1}] Tool: ${t.tool} | Status: ${t.status}\n` +
    `Input: ${clip(t.input, 400)}\n` +
    `Output: ${clip(t.result, 400)}`
  );
}

/**
 * Build one analyst's prompt. Error analysts get ReAct-style instructions
 * (inspect artifacts, validate candidate fixes against ground truth, exclude
 * failures that cannot be causally explained). Success analysts get a
 * single-pass instruction (extract reusable behavior, no fix validation).
 * When `baseSkill` (S0) is provided, patches target deepening it.
 */
export function buildAnalystPrompt(
  batch: TraceBatchInput,
  iteration: number,
  baseSkill?: { id: string; content: string },
): string {
  const traces = batch.traces.map(summarizeTrace).join("\n---\n");
  const roleInstructions =
    batch.role === "error"
      ? `You are an ERROR analyst (ReAct style). For each failing trace:
1. Inspect the trace AND any referenced files/artifacts with your file tools.
2. Compare the actual output against the expected outcome to establish the causal failure mechanism.
3. Validate each candidate fix: would it have prevented THIS failure without breaking the successes?
4. EXCLUDE failures you cannot causally explain — log-only guesses are worse than no patch.`
      : `You are a SUCCESS analyst (single pass). For these passing traces:
1. Identify the reusable behavior pattern behind each success (not instance-specific details).
2. Prefer patterns that recur across multiple traces in this batch.
3. Do not propose fixes — only distill what already works into preservable rules.`;

  const target = baseSkill
    ? `### Base skill S0 (deepen this file, do not create a new one)
Skill id: \`${baseSkill.id}\`
\`\`\`markdown
${baseSkill.content}
\`\`\`

Propose patches that modify S0 in place. Set \`target: ${baseSkill.id}\` on every patch.`
    : `Propose patches for new skills or edits to existing ones (set \`target:\` to the skill id).`;

  return `## WikiSkill Analyst ${batch.batchId} (${batch.role}, iteration ${iteration})

${roleInstructions}

${target}

### Traces in this batch (${batch.traces.length})
${traces}

### Output format — one block per patch, patch ONLY what this batch evidences
\`\`\`wikiskill-patch
target: <skill-id>
changes:
<concise, actionable patch description with concrete workflow steps>
\`\`\`

Rules: one patch per distinct lesson; skip batches with no lesson; keep each patch under 150 words.`;
}

/** One analyst's patch proposal. */
export interface SkillPatch {
  target: string;
  changes: string;
  batchId: number;
  role: AnalystRole;
}

/** Parse all ```wikiskill-patch blocks from an analyst's output. */
export function parsePatch(output: string, batchId: number, role: AnalystRole): SkillPatch[] {
  const patches: SkillPatch[] = [];
  for (const m of output.matchAll(/```wikiskill-patch\s*\n([\s\S]*?)\n```/g)) {
    const body = m[1];
    const target = body.match(/target:\s*(.+)/i)?.[1]?.trim();
    const changes = body.match(/changes:\s*\n([\s\S]*)/)?.[1]?.trim();
    if (target && changes) patches.push({ target, changes, batchId, role });
  }
  return patches;
}

/** Consolidated update for one target skill. */
export interface ConsolidatedPatch {
  target: string;
  /** Merged, deduplicated patch text (prevalent-first ordering). */
  changes: string;
  /** Patch texts that conflicted (kept as alternatives, not silently dropped). */
  alternatives: string[];
  contributingBatches: number[];
}

/**
 * Deterministic hierarchical consolidation: group patches by target skill,
 * dedupe near-identical changes (normalized comparison), order surviving
 * changes by prevalence (error-analyst patches first — they carry validated
 * failure mechanisms), and stash conflicting variants as alternatives.
 * Prevalence-weighted: a change evidenced by multiple independent batches
 * outranks a single-batch observation.
 */
export function consolidatePatches(patches: SkillPatch[]): ConsolidatedPatch[] {
  const byTarget = new Map<string, SkillPatch[]>();
  for (const p of patches) {
    const list = byTarget.get(p.target) ?? [];
    list.push(p);
    byTarget.set(p.target, list);
  }

  const normalize = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const result: ConsolidatedPatch[] = [];
  for (const [target, group] of byTarget) {
    // Dedupe: exact normalized match, or one containing the other.
    const unique: SkillPatch[] = [];
    for (const p of group) {
      const n = normalize(p.changes);
      const dup = unique.some((u) => {
        const m = normalize(u.changes);
        return m === n || (m.length > 40 && n.includes(m)) || (n.length > 40 && m.includes(n));
      });
      if (!dup) unique.push(p);
    }
    // Prevalence ordering: error-analyst patches first, then by length
    // (longer = more evidenced detail), preserving batch order otherwise.
    unique.sort((a, b) => {
      if (a.role !== b.role) return a.role === "error" ? -1 : 1;
      return b.changes.length - a.changes.length;
    });

    // Conflict detection: patches for the same target that share almost no
    // vocabulary are likely pulling in different directions — keep the top
    // one primary, rest as alternatives.
    const primary = unique[0];
    const alternatives: string[] = [];
    if (primary) {
      const primaryWords = new Set(normalize(primary.changes).split(" "));
      for (const p of unique.slice(1)) {
        const words = normalize(p.changes).split(" ");
        const overlap = words.filter((w) => primaryWords.has(w)).length / Math.max(words.length, 1);
        if (overlap < 0.3) alternatives.push(p.changes);
        else primaryWords.forEach((w) => words.includes(w) || primaryWords.add(w));
      }
    }
    const merged = unique
      .filter((p) => !alternatives.includes(p.changes))
      .map((p) => p.changes)
      .join("\n\n");

    result.push({
      target,
      changes: merged,
      alternatives,
      contributingBatches: [...new Set(group.map((p) => p.batchId))].sort((a, b) => a - b),
    });
  }
  return result.sort((a, b) => a.target.localeCompare(b.target));
}

/** Read every *.md patch file from a dir and parse all patch blocks. */
export async function readPatchFiles(
  patchesDir: string,
): Promise<Array<{ file: string; patches: SkillPatch[] }>> {
  const out: Array<{ file: string; patches: SkillPatch[] }> = [];
  let files: string[];
  try {
    files = await fs.readdir(patchesDir);
  } catch {
    return out;
  }
  let batchId = 0;
  for (const file of files.filter((f) => f.endsWith(".md")).sort()) {
    const content = await fs.readFile(path.join(patchesDir, file), "utf-8");
    // Role is unknown from a bare file — parse as generic, batch per file.
    const patches = parsePatch(content, batchId++, "error");
    if (patches.length > 0) out.push({ file, patches });
  }
  return out;
}
