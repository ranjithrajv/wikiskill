// ─── Plugin State (filesystem-backed) ─────────────────────────────────────────
// Harnesses without a native key-value storage API (Claude Code, Codex, ...)
// persist PluginState as a JSON file instead. OpenCode uses ctx.storage and
// doesn't need this — it's here for adapters that do.

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { PluginState } from "./types.js";
import { INITIAL_STATE, serializeState, deserializeState } from "./types.js";
import { wikiSkillRoot } from "./paths.js";

function statePath(projectDir: string): string {
  return path.join(wikiSkillRoot(projectDir), "state.json");
}

/** Read persisted state, or the initial state if none exists yet. */
export async function readState(projectDir: string): Promise<PluginState> {
  try {
    const raw = await fs.readFile(statePath(projectDir), "utf-8");
    return deserializeState(JSON.parse(raw));
  } catch {
    return { ...INITIAL_STATE };
  }
}

/** Persist state to disk. */
export async function writeState(projectDir: string, state: PluginState): Promise<void> {
  const file = statePath(projectDir);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(serializeState(state), null, 2), "utf-8");
}
