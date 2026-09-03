import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  splitTraceBatches,
  buildAnalystPrompt,
  parsePatch,
  consolidatePatches,
  readPatchFiles,
  type SkillPatch,
} from "./analysts.js";
import type { TraceEntry } from "./types.js";

function trace(tool: string, status: "completed" | "error"): TraceEntry {
  return {
    id: `t-${tool}-${status}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    sessionID: "s",
    tool,
    input: {},
    result: {},
    status,
  };
}

describe("splitTraceBatches", () => {
  it("puts error batches first and chunks by batch size", () => {
    const traces = [
      trace("a", "completed"),
      trace("b", "error"),
      trace("c", "error"),
      trace("d", "completed"),
      trace("e", "error"),
    ];
    const batches = splitTraceBatches(traces, 2);
    expect(batches).toHaveLength(3);
    expect(batches[0].role).toBe("error");
    expect(batches[1].role).toBe("error");
    expect(batches[2].role).toBe("success");
    expect(batches.flatMap((b) => b.traces)).toHaveLength(5);
  });

  it("handles empty input", () => {
    expect(splitTraceBatches([], 8)).toEqual([]);
  });
});

describe("buildAnalystPrompt", () => {
  it("gives error analysts ReAct instructions and success analysts single-pass", () => {
    const err = buildAnalystPrompt({ batchId: 0, role: "error", traces: [trace("x", "error")] }, 1);
    expect(err).toContain("ERROR analyst");
    expect(err).toContain("wikiskill-patch");
    const ok = buildAnalystPrompt(
      { batchId: 1, role: "success", traces: [trace("x", "completed")] },
      1,
    );
    expect(ok).toContain("SUCCESS analyst");
  });

  it("embeds the base skill S0 in deepen mode", () => {
    const p = buildAnalystPrompt({ batchId: 0, role: "error", traces: [trace("x", "error")] }, 2, {
      id: "s0",
      content: "# Base skill",
    });
    expect(p).toContain("S0");
    expect(p).toContain("target: s0");
  });
});

describe("parsePatch", () => {
  it("extracts all patch blocks with target and changes", () => {
    const out = [
      "```wikiskill-patch",
      "target: foo",
      "changes:",
      "Always retry once.",
      "```",
      "```wikiskill-patch",
      "target: bar",
      "changes:",
      "Check the file first.",
      "```",
    ].join("\n");
    const patches = parsePatch(out, 3, "error");
    expect(patches).toHaveLength(2);
    expect(patches[0]).toMatchObject({ target: "foo", batchId: 3, role: "error" });
    expect(patches[1].target).toBe("bar");
  });
});

describe("consolidatePatches", () => {
  const mk = (
    target: string,
    changes: string,
    batchId: number,
    role: "error" | "success" = "error",
  ): SkillPatch => ({
    target,
    changes,
    batchId,
    role,
  });

  it("groups by target, dedupes identical patches, orders error-first", () => {
    const patches = [
      mk("foo", "Always verify file existence before editing files in the project", 0, "success"),
      mk("foo", "Always verify file existence before editing files in the project", 1, "error"),
      mk("bar", "Retry once on network timeout errors", 0),
    ];
    const merged = consolidatePatches(patches);
    expect(merged).toHaveLength(2);
    const foo = merged.find((m) => m.target === "foo")!;
    expect(foo.contributingBatches).toEqual([0, 1]);
    // deduped to one surviving change
    expect(foo.changes).not.toContain("Retry");
  });

  it("keeps conflicting directions as alternatives", () => {
    const patches = [
      mk("foo", "Always delete temporary scratch files immediately after use in every task", 0),
      mk("foo", "Never remove cached build artifacts since rebuilds are extremely slow", 1),
    ];
    const merged = consolidatePatches(patches);
    expect(merged).toHaveLength(1);
    expect(merged[0].alternatives).toHaveLength(1);
  });
});

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("readPatchFiles", () => {
  it("reads *.md patch files and skips files without patches", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wikiskill-patches-"));
    dirs.push(dir);
    await fs.writeFile(
      path.join(dir, "batch-0.md"),
      "```wikiskill-patch\ntarget: foo\nchanges:\nDo the thing.\n```\n",
      "utf-8",
    );
    await fs.writeFile(path.join(dir, "notes.md"), "no patches here\n", "utf-8");
    const files = await readPatchFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0].patches[0].target).toBe("foo");
  });

  it("returns [] for a missing directory", async () => {
    expect(await readPatchFiles("/nonexistent-dir-xyz")).toEqual([]);
  });
});
