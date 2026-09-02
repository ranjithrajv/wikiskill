import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runValidationGate, rollbackSkill, shouldAccept } from "./gating.js";
import { snapshotSkills, diffSkillSnapshots } from "./skill-proposer.js";
import { benchRoot } from "./bench.js";
import type { HeadlessRunner } from "./runner.js";

const dirs: string[] = [];
async function tmpProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wikiskill-gating-test-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function writeTask(projectDir: string, id: string, verifyBody: string): Promise<void> {
  const dir = path.join(benchRoot(projectDir), id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "task.md"), "do the thing\n", "utf-8");
  const verifyPath = path.join(dir, "verify");
  await fs.writeFile(verifyPath, `#!/bin/sh\n${verifyBody}\n`, "utf-8");
  await fs.chmod(verifyPath, 0o755);
}

const noopRunner: HeadlessRunner = {
  harness: "claude-code",
  async installSkill() {},
  async run() {
    return { ok: true, output: "" };
  },
};

describe("runValidationGate", () => {
  it("no-ops when no bench tasks are configured", async () => {
    const project = await tmpProject();
    const result = await runValidationGate(project, [], noopRunner, 0.5);
    expect(result.ranBench).toBe(false);
    expect(result.accepted).toBe(false);
  });

  it("accepts when the candidate beats the stored best", async () => {
    const project = await tmpProject();
    await writeTask(project, "always-pass", "exit 0");
    const result = await runValidationGate(project, [{ id: "s", content: "x" }], noopRunner, 0);
    expect(result.ranBench).toBe(true);
    expect(result.score).toBe(1);
    expect(result.accepted).toBe(true);
  });

  it("rejects when the candidate does not beat the stored best", async () => {
    const project = await tmpProject();
    await writeTask(project, "always-fail", "exit 1");
    const result = await runValidationGate(project, [{ id: "s", content: "x" }], noopRunner, 0.5);
    expect(result.ranBench).toBe(true);
    expect(result.score).toBe(0);
    expect(result.accepted).toBe(false);
  });

  it("matches shouldAccept's strict-improvement rule", async () => {
    const project = await tmpProject();
    await writeTask(project, "always-pass", "exit 0");
    const result = await runValidationGate(project, [{ id: "s", content: "x" }], noopRunner, 1);
    // score (1) is not > bestScore (1) — ties do not count as improvement
    expect(result.accepted).toBe(shouldAccept(result.score, 1));
    expect(result.accepted).toBe(false);
  });
});

describe("rollbackSkill", () => {
  it("restores the .bak for an edited skill", async () => {
    const skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), "wikiskill-skills-"));
    dirs.push(skillsDir);
    await fs.writeFile(path.join(skillsDir, "foo.md"), "new content", "utf-8");
    await fs.writeFile(path.join(skillsDir, "foo.md.bak"), "original content", "utf-8");

    const ok = await rollbackSkill(skillsDir, "foo");
    expect(ok).toBe(true);
    expect(await fs.readFile(path.join(skillsDir, "foo.md"), "utf-8")).toBe("original content");
    await expect(fs.access(path.join(skillsDir, "foo.md.bak"))).rejects.toThrow();
  });

  it("deletes a newly created skill with no backup", async () => {
    const skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), "wikiskill-skills-"));
    dirs.push(skillsDir);
    await fs.writeFile(path.join(skillsDir, "bar.md"), "brand new", "utf-8");

    const ok = await rollbackSkill(skillsDir, "bar");
    expect(ok).toBe(true);
    await expect(fs.access(path.join(skillsDir, "bar.md"))).rejects.toThrow();
  });
});

describe("skill snapshot diffing", () => {
  it("detects an edited and a newly created file, ignores untouched ones", async () => {
    const skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), "wikiskill-skills-"));
    dirs.push(skillsDir);
    await fs.writeFile(path.join(skillsDir, "untouched.md"), "same", "utf-8");
    await fs.writeFile(path.join(skillsDir, "edited.md"), "before", "utf-8");
    const before = await snapshotSkills(skillsDir);

    await fs.writeFile(path.join(skillsDir, "edited.md"), "after", "utf-8");
    await fs.writeFile(path.join(skillsDir, "created.md"), "new", "utf-8");
    const after = await snapshotSkills(skillsDir);

    const changed = diffSkillSnapshots(before, after).sort();
    expect(changed).toEqual(["created", "edited"]);
  });
});
