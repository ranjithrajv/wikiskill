// ─── Trace Capture ─────────────────────────────────────────────────────────────
// Raw Layer: captures immutable execution traces from tool calls.
//
// This module provides a tool.hook("execute.after") callback that records
// every tool invocation — including its input, output, status, and timing —
// into trace files on disk. These traces are the raw material that the
// Wiki Maintainer analyzes to extract patterns.
//
// Key design choice from the paper: the Inference Agent does NOT have
// access to the wiki during execution. The wiki is only read by the
// Wiki Maintainer and Skill Proposer during the evolution loop.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { TraceEntry } from "./types.js";

/** Directory where raw traces are stored. */
export function tracesRoot(projectDir: string): string {
  return path.join(projectDir, ".opencode", "wikiskill", "raw");
}

/** Ensure the traces directory exists. */
export async function ensureTraces(root: string): Promise<void> {
  await fs.mkdir(root, { recursive: true });
}

/** Append a trace entry to the current batch file. */
export async function appendTrace(root: string, entry: TraceEntry): Promise<void> {
  const filename = `traces-${entry.sessionID.slice(0, 8)}.jsonl`;
  const filepath = path.join(root, filename);
  const line = JSON.stringify(entry) + "\n";
  await fs.appendFile(filepath, line, "utf-8");
}

/** Read all traces from the current iteration. */
export async function readTraces(root: string, limit?: number): Promise<TraceEntry[]> {
  try {
    const files = await fs.readdir(root);
    const jsonlFiles = files
      .filter((f: string) => f.endsWith(".jsonl"))
      .sort()
      .reverse();
    const entries: TraceEntry[] = [];

    for (const file of jsonlFiles) {
      const content = await fs.readFile(path.join(root, file), "utf-8");
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line) as TraceEntry);
        } catch {
          // skip malformed lines
        }
      }
      if (limit && entries.length >= limit) break;
    }

    return limit ? entries.slice(0, limit) : entries;
  } catch {
    return [];
  }
}

/** Read traces for a specific session. */
export async function readSessionTraces(root: string, sessionID: string): Promise<TraceEntry[]> {
  const filename = `traces-${sessionID.slice(0, 8)}.jsonl`;
  try {
    const content = await fs.readFile(path.join(root, filename), "utf-8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line) as TraceEntry);
  } catch {
    return [];
  }
}

/** Get trace statistics. */
export async function traceStats(root: string): Promise<{
  totalTraces: number;
  sessions: number;
  successRate: number;
}> {
  const traces = await readTraces(root);
  const sessions = new Set(traces.map((t) => t.sessionID));
  const successes = traces.filter((t) => t.status === "completed").length;
  return {
    totalTraces: traces.length,
    sessions: sessions.size,
    successRate: traces.length > 0 ? successes / traces.length : 0,
  };
}

/** Clear old traces (keep only the most recent N batches). */
export async function pruneTraces(root: string, keepBatches: number = 5): Promise<void> {
  try {
    const files = await fs.readdir(root);
    const jsonlFiles = files.filter((f: string) => f.endsWith(".jsonl")).sort();
    if (jsonlFiles.length > keepBatches) {
      const toDelete = jsonlFiles.slice(0, jsonlFiles.length - keepBatches);
      for (const file of toDelete) {
        await fs.unlink(path.join(root, file));
      }
    }
  } catch {
    // ignore
  }
}
