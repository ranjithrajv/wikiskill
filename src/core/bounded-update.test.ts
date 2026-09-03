import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseEditOps,
  dedupeEdits,
  clipEdits,
  learningRateFor,
  applyEditsToContent,
  applyEditOps,
  editFraction,
  enforceEditBudget,
  DEFAULT_TEXTUAL_LR,
} from "./bounded-update.js";

const dirs: string[] = [];
async function tmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wikiskill-bounded-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

const SKILL = `---
name: Test
description: Test skill
---

## Workflow
1. Do step one
2. Do step two

## Pitfalls
- Avoid the thing
`;

describe("parseEditOps", () => {
  it("parses add/replace/delete entries separated by ---", () => {
    const out = [
      "```wikiskill-edits",
      "op: replace",
      "section: Workflow",
      "content:",
      "1. Do step one first",
      "---",
      "op: delete",
      "section: Pitfalls",
      "```",
    ].join("\n");
    const edits = parseEditOps(out);
    expect(edits).toHaveLength(2);
    expect(edits[0]).toMatchObject({ op: "replace", section: "Workflow" });
    expect(edits[0].content).toContain("step one first");
    expect(edits[1]).toMatchObject({ op: "delete", section: "Pitfalls" });
  });

  it("returns [] when no block is present", () => {
    expect(parseEditOps("no proposal here")).toEqual([]);
  });
});

describe("dedupeEdits + clipEdits", () => {
  it("drops exact duplicates and clips to budget", () => {
    const e = { op: "add" as const, section: "", content: "x" };
    const deduped = dedupeEdits([e, { ...e }, { op: "add" as const, section: "", content: "y" }]);
    expect(deduped).toHaveLength(2);
    expect(clipEdits(deduped, 1)).toHaveLength(1);
  });
});

describe("learningRateFor", () => {
  it("decays from base to floor over maxIterations", () => {
    expect(learningRateFor(1, 10)).toBe(4);
    expect(learningRateFor(10, 10)).toBe(2);
    const mid = learningRateFor(5, 10);
    expect(mid).toBeGreaterThanOrEqual(2);
    expect(mid).toBeLessThanOrEqual(4);
  });
});

describe("applyEditsToContent", () => {
  it("replaces a section body while preserving the heading", () => {
    const out = applyEditsToContent(SKILL, [
      { op: "replace", section: "workflow", content: "1. New step" },
    ]);
    expect(out).toContain("## Workflow");
    expect(out).toContain("1. New step");
    expect(out).not.toContain("Do step one");
    expect(out).toContain("## Pitfalls");
  });

  it("deletes a section and appends additions", () => {
    const out = applyEditsToContent(SKILL, [
      { op: "delete", section: "Pitfalls" },
      { op: "add", section: "", content: "## Notes\n- hello" },
    ]);
    expect(out).not.toContain("## Pitfalls");
    expect(out).toContain("## Notes");
  });

  it("skips edits targeting unknown sections", () => {
    const out = applyEditsToContent(SKILL, [{ op: "replace", section: "Nope", content: "x" }]);
    expect(out).toContain("Do step one");
  });
});

describe("applyEditOps + enforceEditBudget", () => {
  it("leaves a .bak and passes budget for a small edit", async () => {
    const dir = await tmpDir();
    await fs.writeFile(path.join(dir, "s.md"), SKILL, "utf-8");
    const { applied, skipped } = await applyEditOps(dir, "s", [
      { op: "replace", section: "Workflow", content: "1. New step" },
    ]);
    expect(applied).toBe(1);
    expect(skipped).toBe(0);
    const check = await enforceEditBudget(dir, ["s"], DEFAULT_TEXTUAL_LR);
    expect(check.within).toBe(true);
  });

  it("flags a wholesale rewrite as over budget", async () => {
    const dir = await tmpDir();
    await fs.writeFile(path.join(dir, "s.md"), SKILL, "utf-8");
    await fs.writeFile(path.join(dir, "s.md.bak"), SKILL, "utf-8");
    await fs.writeFile(path.join(dir, "s.md"), "completely different\n".repeat(50), "utf-8");
    const check = await enforceEditBudget(dir, ["s"], DEFAULT_TEXTUAL_LR);
    expect(check.within).toBe(false);
    expect(check.violations[0]).toContain("s");
  });

  it("flags an oversized new skill", async () => {
    const dir = await tmpDir();
    await fs.writeFile(path.join(dir, "big.md"), "line\n".repeat(200), "utf-8");
    const check = await enforceEditBudget(dir, ["big"], DEFAULT_TEXTUAL_LR);
    expect(check.within).toBe(false);
  });
});

describe("editFraction", () => {
  it("is 0 for identical content and 1 for fully replaced", () => {
    expect(editFraction("a\nb", "a\nb")).toBe(0);
    expect(editFraction("a\nb", "c\nd")).toBe(1);
  });
});
