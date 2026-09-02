// ─── Discover: which harness CLIs are actually installed ─────────────────────
// Distinct from `detectHarnesses` in init.ts (which looks for project config
// that proves a harness has been *used here before*): this probes $PATH for
// the harness's own binary, so `wikiskill open` can offer/launch it even in
// a project that has never been wired for it yet.

import { execSync } from "node:child_process";
import type { Harness } from "./init.js";

export interface HarnessBinary {
  harness: Harness;
  /** The executable name as invoked on the command line. */
  command: string;
}

const KNOWN_BINARIES: HarnessBinary[] = [
  { harness: "claude-code", command: "claude" },
  { harness: "codex", command: "codex" },
  { harness: "opencode", command: "opencode" },
];

function findOnPath(command: string): string | null {
  try {
    const out =
      process.platform === "win32"
        ? execSync(`where ${command}`, { encoding: "utf-8" })
        : execSync(`command -v ${command}`, { encoding: "utf-8" });
    return out.split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

export interface DetectedHarness extends HarnessBinary {
  /** Resolved path to the executable. */
  path: string;
}

/** Which harness CLIs are installed (on $PATH) on this machine. */
export function detectInstalledHarnesses(): DetectedHarness[] {
  const found: DetectedHarness[] = [];
  for (const bin of KNOWN_BINARIES) {
    const resolved = findOnPath(bin.command);
    if (resolved) found.push({ ...bin, path: resolved });
  }
  return found;
}
