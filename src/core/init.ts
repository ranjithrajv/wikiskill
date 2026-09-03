// ─── Init: auto-detect + wire installed harnesses ─────────────────────────────
// Makes `npm install` feel like a 1-click install: on postinstall, detect
// which harness(es) are already configured in the project (a `.claude/`
// dir, an `AGENTS.md` / `.codex/`, an `opencode.jsonc`) and finish wiring
// WikiSkill into whichever ones are already there. Never invents a harness
// config that wasn't already present — that's what the `force` flag is for
// (an explicit `wikiskill init --claude-code` etc. on a fresh project).

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { skillsRoot } from "./paths.js";

export type Harness = "opencode" | "claude-code" | "codex" | "pi" | "hermes";

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Which harnesses already have config present in this project. */
export async function detectHarnesses(projectDir: string): Promise<Harness[]> {
  const found: Harness[] = [];
  if (
    (await exists(path.join(projectDir, "opencode.jsonc"))) ||
    (await exists(path.join(projectDir, "opencode.json")))
  ) {
    found.push("opencode");
  }
  if (await exists(path.join(projectDir, ".claude"))) found.push("claude-code");
  if (
    (await exists(path.join(projectDir, "AGENTS.md"))) ||
    (await exists(path.join(projectDir, ".codex")))
  ) {
    found.push("codex");
  }
  if (await exists(path.join(projectDir, ".pi"))) found.push("pi");
  if (
    (await exists(path.join(projectDir, "hermes.yaml"))) ||
    (await exists(path.join(projectDir, "hermes.json"))) ||
    (await exists(path.join(projectDir, ".hermes")))
  ) {
    found.push("hermes");
  }
  return found;
}

// ─── Claude Code ───────────────────────────────────────────────────────────────

const CLAUDE_HOOK_COMMAND = "npx wikiskill trace";

const CLAUDE_COMMANDS: Record<string, string> = {
  "wiki-evolve.md": `---
description: Run one WikiSkill evolution iteration (analyze traces → update wiki → propose skill → validate → gate)
allowed-tools: Bash(npx wikiskill:*), Read, Write, Edit
---

Run \`npx wikiskill evolve-prompt\` and follow the printed instructions exactly, step by step, using your file tools.

When every step is complete, run \`npx wikiskill evolve-complete\` to close out the iteration.
`,
  "wiki-status.md": `---
description: Show WikiSkill evolution status and statistics
allowed-tools: Bash(npx wikiskill:*)
---

Run \`npx wikiskill status\` and show the output to the user as-is.
`,
  "wiki-reset.md": `---
description: Reset WikiSkill evolution state (keeps wiki patterns)
allowed-tools: Bash(npx wikiskill:*)
---

Run \`npx wikiskill reset\` and show the output to the user.
`,
};

/**
 * Materialize skills where Claude Code actually loads project skills from
 * (`.claude/skills/<id>/SKILL.md` — confirmed against a live install; a bare
 * top-level `skills/` directory is NOT auto-discovered). Writes only what
 * changed, so this is safe to call on every init/open/validate.
 */
export async function syncClaudeCodeSkills(
  projectDir: string,
  frameworkSkillPath?: string,
): Promise<string[]> {
  const changes: string[] = [];
  const destDir = path.join(projectDir, ".claude", "skills");

  async function syncOne(id: string, content: string): Promise<void> {
    const dest = path.join(destDir, id, "SKILL.md");
    const current = (await exists(dest)) ? await fs.readFile(dest, "utf-8") : null;
    if (current === content) return;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content, "utf-8");
    changes.push(`synced ${dest}`);
  }

  if (frameworkSkillPath && (await exists(frameworkSkillPath))) {
    await syncOne("wikiskill", await fs.readFile(frameworkSkillPath, "utf-8"));
  }

  const evolvedDir = skillsRoot(projectDir);
  const evolvedFiles = (await exists(evolvedDir)) ? await fs.readdir(evolvedDir) : [];
  for (const file of evolvedFiles) {
    if (!file.endsWith(".md")) continue;
    await syncOne(
      file.replace(/\.md$/, ""),
      await fs.readFile(path.join(evolvedDir, file), "utf-8"),
    );
  }

  return changes;
}

/** Wire the Claude Code adapter: merge the PostToolUse hook, add slash commands, sync skills. */
export async function wireClaudeCode(
  projectDir: string,
  frameworkSkillPath?: string,
): Promise<string[]> {
  const changes: string[] = [];
  const claudeDir = path.join(projectDir, ".claude");
  await fs.mkdir(claudeDir, { recursive: true });

  // Merge (not overwrite) settings.json.
  const settingsPath = path.join(claudeDir, "settings.json");
  let settings: any = {};
  if (await exists(settingsPath)) {
    try {
      settings = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
    } catch {
      // Unparseable settings.json — don't touch it, surface for manual merge.
      changes.push(`SKIPPED ${settingsPath} (not valid JSON — merge the hook manually)`);
      settings = null;
    }
  }
  if (settings !== null) {
    settings.hooks ??= {};
    settings.hooks.PostToolUse ??= [];
    const alreadyWired = JSON.stringify(settings.hooks.PostToolUse).includes(CLAUDE_HOOK_COMMAND);
    if (!alreadyWired) {
      settings.hooks.PostToolUse.push({
        matcher: "*",
        hooks: [{ type: "command", command: CLAUDE_HOOK_COMMAND }],
      });
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
      changes.push(`wired PostToolUse hook in ${settingsPath}`);
    }
  }

  // Commands: only write files that don't already exist — never clobber user edits.
  const commandsDir = path.join(claudeDir, "commands");
  await fs.mkdir(commandsDir, { recursive: true });
  for (const [name, content] of Object.entries(CLAUDE_COMMANDS)) {
    const dest = path.join(commandsDir, name);
    if (await exists(dest)) continue;
    await fs.writeFile(dest, content, "utf-8");
    changes.push(`added ${dest}`);
  }

  changes.push(...(await syncClaudeCodeSkills(projectDir, frameworkSkillPath)));

  return changes;
}

// ─── Codex CLI ─────────────────────────────────────────────────────────────────

const CODEX_AGENTS_MARKER = "## WikiSkill";

const CODEX_AGENTS_BLOCK = `${CODEX_AGENTS_MARKER}

This project uses WikiSkill for persistent, evolving skills at \`.wikiskill/\`.

- After any non-trivial tool call (edit, command, search that changes your
  plan), log it:
  \`npx wikiskill trace-manual --tool <name> --status completed|error\`
  (add \`--input '<json>'\` / \`--result '<json>'\` when it's worth capturing).
- Before starting work, check \`.wikiskill/skills/\` for relevant evolved
  skills and follow them.
- Run \`npx wikiskill status\` to see current patterns and evolution state.
- Run \`npx wikiskill evolve-prompt\` to start a WikiSkill evolution iteration,
  then execute the printed steps and finish with \`npx wikiskill evolve-complete\`.
`;

const CODEX_PROMPTS: Record<string, string> = {
  "wiki-evolve.md": `Run \`npx wikiskill evolve-prompt\` and follow the printed instructions exactly,
step by step, using your file tools. When every step is complete, run
\`npx wikiskill evolve-complete\` to close out the iteration.
`,
  "wiki-status.md": `Run \`npx wikiskill status\` and show me the output as-is.
`,
  "wiki-reset.md": `Run \`npx wikiskill reset\` and show me the output.
`,
};

/** Wire the Codex adapter: append the AGENTS.md block, add custom prompts. */
export async function wireCodex(projectDir: string): Promise<string[]> {
  const changes: string[] = [];

  const agentsPath = path.join(projectDir, "AGENTS.md");
  const current = (await exists(agentsPath)) ? await fs.readFile(agentsPath, "utf-8") : "";
  if (!current.includes(CODEX_AGENTS_MARKER)) {
    const next =
      current.trim().length > 0
        ? `${current.trimEnd()}\n\n${CODEX_AGENTS_BLOCK}`
        : CODEX_AGENTS_BLOCK;
    await fs.writeFile(agentsPath, next, "utf-8");
    changes.push(`appended WikiSkill section to ${agentsPath}`);
  }

  const promptsDir = path.join(projectDir, ".codex", "prompts");
  await fs.mkdir(promptsDir, { recursive: true });
  for (const [name, content] of Object.entries(CODEX_PROMPTS)) {
    const dest = path.join(promptsDir, name);
    if (await exists(dest)) continue;
    await fs.writeFile(dest, content, "utf-8");
    changes.push(`added ${dest}`);
  }

  return changes;
}

// ─── OpenCode ────────────────────────────────────────────────────────────────
// opencode.jsonc is JSONC (comments allowed) — too risky to auto-edit without
// a JSONC-aware parser. Detect whether it's already wired and, if not, print
// the snippet rather than guessing at an edit.

export async function checkOpenCode(projectDir: string): Promise<string[]> {
  const changes: string[] = [];
  for (const name of ["opencode.jsonc", "opencode.json"]) {
    const p = path.join(projectDir, name);
    if (!(await exists(p))) continue;
    const content = await fs.readFile(p, "utf-8");
    if (content.includes("wikiskill")) {
      changes.push(`${p} already references wikiskill`);
    } else {
      changes.push(
        `ACTION NEEDED: add "wikiskill" to the "plugins" array in ${p} (see README § OpenCode)`,
      );
    }
  }
  return changes;
}

// ─── Pi ────────────────────────────────────────────────────────────────────────
// Pi uses a `.pi/` directory for project config and a skill mechanism.
// We write a `.pi/wikiskill.md` instructions file that Pi loads as project
// context, plus install Pi skills at `.pi/skills/wikiskill/`.

const PI_MARKER = "## WikiSkill";

const PI_INSTRUCTIONS = `${PI_MARKER}

This project uses WikiSkill for persistent, evolving skills at \`.wikiskill/\`.

- After any non-trivial tool call (edit, command, search that changes your
  plan), log it:
  \`npx wikiskill trace-manual --tool <name> --status completed|error\`
  (add \`--input '<json>'\` / \`--result '<json>'\` when it's worth capturing).
- Before starting work, check \`.wikiskill/skills/\` for relevant evolved
  skills and follow them.
- Run \`npx wikiskill status\` to see current patterns and evolution state.
- Run \`npx wikiskill evolve-prompt\` to start a WikiSkill evolution iteration,
  then execute the printed steps and finish with \`npx wikiskill evolve-complete\`.
`;

const PI_SKILLS: Record<string, string> = {
  "wiki-evolve.md": `Run \`npx wikiskill evolve-prompt\` and follow the printed instructions exactly,
step by step, using your file tools. When every step is complete, run
\`npx wikiskill evolve-complete\` to close out the iteration.
`,
  "wiki-status.md": `Run \`npx wikiskill status\` and show me the output as-is.
`,
  "wiki-reset.md": `Run \`npx wikiskill reset\` and show me the output.
`,
};

/** Wire the Pi adapter: write `.pi/wikiskill.md` + install skills. */
export async function wirePi(projectDir: string): Promise<string[]> {
  const changes: string[] = [];
  const piDir = path.join(projectDir, ".pi");
  await fs.mkdir(piDir, { recursive: true });

  // Write instructions file
  const instructionsPath = path.join(piDir, "wikiskill.md");
  const current = (await exists(instructionsPath))
    ? await fs.readFile(instructionsPath, "utf-8")
    : "";
  if (!current.includes(PI_MARKER)) {
    const next =
      current.trim().length > 0 ? `${current.trimEnd()}\n\n${PI_INSTRUCTIONS}` : PI_INSTRUCTIONS;
    await fs.writeFile(instructionsPath, next, "utf-8");
    changes.push(`wrote WikiSkill instructions to ${instructionsPath}`);
  }

  // Install skills
  const skillsDir = path.join(piDir, "skills", "wikiskill");
  await fs.mkdir(skillsDir, { recursive: true });
  for (const [name, content] of Object.entries(PI_SKILLS)) {
    const dest = path.join(skillsDir, name);
    if (await exists(dest)) continue;
    await fs.writeFile(dest, content, "utf-8");
    changes.push(`added ${dest}`);
  }

  return changes;
}

// ─── Hermes ───────────────────────────────────────────────────────────────────
// Hermes uses SOUL.md for personality/instructions and has a built-in skills
// system. We append a WikiSkill section to SOUL.md and install Hermes skills.

const HERMES_MARKER = "## WikiSkill";

const HERMES_SOUL_BLOCK = `${HERMES_MARKER}

This project uses WikiSkill for persistent, evolving skills at \`.wikiskill/\`.

- After any non-trivial tool call (edit, command, search that changes your
  plan), log it:
  \`npx wikiskill trace-manual --tool <name> --status completed|error\`
  (add \`--input '<json>'\` / \`--result '<json>'\` when it's worth capturing).
- Before starting work, check \`.wikiskill/skills/\` for relevant evolved
  skills and follow them.
- Run \`npx wikiskill status\` to see current patterns and evolution state.
- Run \`npx wikiskill evolve-prompt\` to start a WikiSkill evolution iteration,
  then execute the printed steps and finish with \`npx wikiskill evolve-complete\`.
`;

const HERMES_SKILLS: Record<string, string> = {
  "wiki-evolve.md": `Run \`npx wikiskill evolve-prompt\` and follow the printed instructions exactly,
step by step, using your file tools. When every step is complete, run
\`npx wikiskill evolve-complete\` to close out the iteration.
`,
  "wiki-status.md": `Run \`npx wikiskill status\` and show me the output as-is.
`,
  "wiki-reset.md": `Run \`npx wikiskill reset\` and show me the output.
`,
};

/** Wire the Hermes adapter: append to SOUL.md + install skills. */
export async function wireHermes(projectDir: string): Promise<string[]> {
  const changes: string[] = [];

  // Append to SOUL.md (Hermes' personality/instructions file)
  const soulPath = path.join(projectDir, "SOUL.md");
  const currentSoul = (await exists(soulPath)) ? await fs.readFile(soulPath, "utf-8") : "";
  if (!currentSoul.includes(HERMES_MARKER)) {
    const next =
      currentSoul.trim().length > 0
        ? `${currentSoul.trimEnd()}\n\n${HERMES_SOUL_BLOCK}`
        : HERMES_SOUL_BLOCK;
    await fs.writeFile(soulPath, next, "utf-8");
    changes.push(`appended WikiSkill section to ${soulPath}`);
  }

  // Install Hermes skills
  const skillsDir = path.join(projectDir, ".hermes", "skills", "wikiskill");
  await fs.mkdir(skillsDir, { recursive: true });
  for (const [name, content] of Object.entries(HERMES_SKILLS)) {
    const dest = path.join(skillsDir, name);
    if (await exists(dest)) continue;
    await fs.writeFile(dest, content, "utf-8");
    changes.push(`added ${dest}`);
  }

  return changes;
}

// ─── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Wire whichever harnesses are already detected in the project. Pass `force`
 * to wire specific harnesses regardless of detection (bootstrapping a fresh
 * project — e.g. `wikiskill init --claude-code`).
 */
export async function runInit(
  projectDir: string,
  force: Harness[] = [],
  frameworkSkillPath?: string,
): Promise<{ harnesses: Harness[]; changes: string[] }> {
  const detected = await detectHarnesses(projectDir);
  const targets = new Set<Harness>([...detected, ...force]);
  const changes: string[] = [];

  if (targets.has("claude-code"))
    changes.push(...(await wireClaudeCode(projectDir, frameworkSkillPath)));
  if (targets.has("codex")) changes.push(...(await wireCodex(projectDir)));
  if (targets.has("opencode")) changes.push(...(await checkOpenCode(projectDir)));
  if (targets.has("pi")) changes.push(...(await wirePi(projectDir)));
  if (targets.has("hermes")) changes.push(...(await wireHermes(projectDir)));

  return { harnesses: [...targets], changes };
}
