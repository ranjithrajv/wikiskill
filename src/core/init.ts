// ─── Init: auto-detect + wire installed harnesses ─────────────────────────────
// Makes `npm install` feel like a 1-click install: on postinstall, detect
// which harness(es) are already configured in the project (a `.claude/`
// dir, an `AGENTS.md` / `.codex/`, an `opencode.jsonc`) and finish wiring
// WikiSkill into whichever ones are already there. Never invents a harness
// config that wasn't already present — that's what the `force` flag is for
// (an explicit `wikiskill init --claude-code` etc. on a fresh project).

import * as fs from "node:fs/promises";
import * as path from "node:path";

export type Harness = "opencode" | "claude-code" | "codex";

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

/** Wire the Claude Code adapter: merge the PostToolUse hook, add slash commands. */
export async function wireClaudeCode(projectDir: string): Promise<string[]> {
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
    const next = current.trim().length > 0 ? `${current.trimEnd()}\n\n${CODEX_AGENTS_BLOCK}` : CODEX_AGENTS_BLOCK;
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

// ─── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Wire whichever harnesses are already detected in the project. Pass `force`
 * to wire specific harnesses regardless of detection (bootstrapping a fresh
 * project — e.g. `wikiskill init --claude-code`).
 */
export async function runInit(
  projectDir: string,
  force: Harness[] = [],
): Promise<{ harnesses: Harness[]; changes: string[] }> {
  const detected = await detectHarnesses(projectDir);
  const targets = new Set<Harness>([...detected, ...force]);
  const changes: string[] = [];

  if (targets.has("claude-code")) changes.push(...(await wireClaudeCode(projectDir)));
  if (targets.has("codex")) changes.push(...(await wireCodex(projectDir)));
  if (targets.has("opencode")) changes.push(...(await checkOpenCode(projectDir)));

  return { harnesses: [...targets], changes };
}
