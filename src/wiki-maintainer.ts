// ─── Wiki Maintainer ───────────────────────────────────────────────────────────
// The Wiki Maintainer agent: analyzes execution traces and consolidates
// insights into the persistent wiki.
//
// From the paper (§3.2.2):
//   "The Wiki Maintainer agent receives the full wiki context W_{k-1} alongside
//    sampled traces. It performs root cause analysis on the failing tasks, and
//    extracts successful strategies from the passing tasks."
//
// In OpenCode, this is implemented as a prompt to an LLM session that:
// 1. Reads the current wiki state
// 2. Reads sampled execution traces
// 3. Analyzes failures and successes
// 4. Creates or updates pattern pages
// 5. Appends to the evolution log

import type { TraceEntry } from "./types.js";
import {
  wikiRoot,
  ensureWiki,
  writePattern,
  rebuildIndex,
  appendEvolutionLog,
  readSkillImpact,
  listPatterns,
} from "./wiki-manager.js";
import { tracesRoot, readTraces } from "./trace-capture.js";

/** Build the system prompt for the Wiki Maintainer agent. */
function buildMaintainerPrompt(wikiIndex: string, skillImpact: string): string {
  return `You are the Wiki Maintainer for WikiSkill — a persistent knowledge base that accumulates patterns from agent execution experience.

## Your Role
You analyze execution traces from an agent and extract actionable patterns into a persistent wiki. Your patterns guide future skill evolution.

## Current Wiki State
${wikiIndex || "_No patterns yet — this is the first iteration._"}

## Skill Impact History
${skillImpact || "_No history yet._"}

## Instructions
1. Analyze the provided execution traces — focus on FAILURES to diagnose root causes and SUCCESSES to extract reusable strategies.
2. For each pattern you identify:
   - Create a new markdown file in wiki/patterns/ with filename: \`<category>-<short-slug>.md\`
   - Include sections: Description, Actionable, Evidence
   - Category must be one of: failure, success, strategy
3. Update the wiki index by listing all patterns.
4. Append a summary to the evolution log (wiki/logs.md).
5. If an existing pattern is reinforced by new evidence, UPDATE it rather than creating a duplicate.

## Pattern File Format
\`\`\`markdown
# <Pattern Title>

Category: <failure|success|strategy>

## Description
<What this pattern describes>

## Actionable
<What an agent should do (or avoid) based on this pattern>

## Evidence
- <Trace or observation that supports this pattern>
\`\`\`

## Rules
- Focus on patterns that recur across multiple traces — not one-off glitches.
- Be specific and actionable, not vague.
- Do NOT create patterns that duplicate existing ones.
- Update existing patterns when new evidence strengthens them.
- Keep patterns concise (under 200 words each).`;
}

/** Build the user prompt with traces for analysis. */
function buildTraceAnalysisPrompt(traces: TraceEntry[], iteration: number): string {
  const successes = traces.filter((t) => t.status === "completed");
  const failures = traces.filter((t) => t.status === "error");

  const traceSummary = traces
    .map(
      (t, i) =>
        `[Trace ${i + 1}] Tool: ${t.tool} | Status: ${t.status}\n` +
        `Input: ${truncate(JSON.stringify(t.input), 500)}\n` +
        `Output: ${truncate(JSON.stringify(t.result), 500)}\n` +
        (t.durationMs ? `Duration: ${t.durationMs}ms\n` : ""),
    )
    .join("\n---\n");

  return `## Evolution Iteration ${iteration}

Analyze these execution traces and extract patterns for the wiki.

### Summary
- Total traces: ${traces.length}
- Successes: ${successes.length}
- Failures: ${failures.length}

### Traces
${traceSummary}

### Instructions
1. Identify recurring failure patterns and their root causes.
2. Identify successful strategies that could be codified.
3. Create or update pattern files in wiki/patterns/.
4. Append a summary to wiki/logs.md with timestamp and iteration number.
5. Rebuild wiki/index.md with the current pattern catalog.`;
}

/**
 * Run the Wiki Maintainer for one iteration.
 *
 * This builds the prompts and returns them for the caller to dispatch
 * through ctx.session.prompt() or ctx.generate.text(). We keep the
 * prompt construction pure so the plugin doesn't need to know about
 * session management details.
 */
export async function buildMaintainerTask(
  projectDir: string,
  iteration: number,
  sampleSize: number = 20,
): Promise<{ prompt: string; systemPrompt: string }> {
  const root = wikiRoot(projectDir);
  await ensureWiki(root);

  // Read current wiki state
  const patterns = await listPatterns(root);
  const indexContent =
    patterns.length > 0
      ? `## Current Patterns (${patterns.length})\n${patterns.map((p) => `- ${p.title} (${p.id}): ${p.description}`).join("\n")}`
      : "_No patterns yet._";
  const skillImpact = await readSkillImpact(root);

  // Sample traces for analysis
  const traceDir = tracesRoot(projectDir);
  const traces = await readTraces(traceDir, sampleSize);

  return {
    systemPrompt: buildMaintainerPrompt(indexContent, skillImpact),
    prompt: buildTraceAnalysisPrompt(traces, iteration),
  };
}

/**
 * Apply the Wiki Maintainer's output to the wiki.
 *
 * After the LLM generates pattern files and log entries, we parse
 * and write them to the filesystem.
 */
export async function applyMaintainerOutput(
  projectDir: string,
  patternsToCreate: Array<{ id: string; content: string }>,
  logEntry: string,
): Promise<void> {
  const root = wikiRoot(projectDir);
  await ensureWiki(root);

  // Write all pattern files
  for (const pattern of patternsToCreate) {
    await writePattern(root, `${pattern.id}.md`, pattern.content);
  }

  // Append to evolution log
  if (logEntry) {
    await appendEvolutionLog(root, logEntry);
  }

  // Rebuild the index
  await rebuildIndex(root);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
