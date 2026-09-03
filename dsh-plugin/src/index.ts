// ─── WikiSkill Cordis plugin for DeepSeek Harness (dsh) ───────────────────────
// Verified against deepseek-ai/deepseek-harness @ v0.1.2-rc.1 (developer
// preview, 2026-08-30): plugin shape (`name` / `inject` / `apply`), tools via
// `ctx.tools.register(defineTool(...))`, human commands via
// `ctx.commands.register(...)` guarded by presence (the headless profile may
// not mount the commands registry).
//
// Design: the plugin shells out to the `wikiskill` CLI (same binary the
// Claude Code / Codex adapters use) so the harness-agnostic core
// (`.wikiskill/` Raw/Wiki/Skills layers) stays the single source of truth —
// no duplicated evolution logic. Requires `wikiskill` resolvable on PATH
// (global install) or `npx wikiskill` fallback.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "wikiskill";

/** Only `tools` is required — `commands` is used opportunistically if mounted. */
export const inject = ["tools"];

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 8000;

function truncate(out: string): string {
  return out.length > MAX_OUTPUT ? out.slice(0, MAX_OUTPUT) + "\n…(truncated)" : out;
}

async function runWikiskill(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("wikiskill", args, { cwd, timeout: 120_000 });
    return truncate(stdout.trim() || "(no output)");
  } catch (err: any) {
    // Fall back to npx when no global install is on PATH.
    if (err?.code === "ENOENT") {
      const { stdout } = await execFileAsync("npx", ["wikiskill", ...args], {
        cwd,
        timeout: 180_000,
      });
      return truncate(stdout.trim() || "(no output)");
    }
    const detail = (err?.stdout ?? err?.stderr ?? err?.message ?? String(err)).trim();
    throw new Error(`wikiskill ${args[0]} failed: ${truncate(detail)}`);
  }
}

function projectOf(args: { project?: string }): string {
  return args.project ?? process.cwd();
}

export function apply(ctx: any): void {
  ctx.tools.register(
    defineTool({
      name: "wiki_status",
      description:
        "Show WikiSkill evolution status: iteration, best score, pattern/trace counts, recent patterns. Call before starting work to see learned skills context.",
      parameters: {
        project: { type: "string", description: "Project directory (default: harness cwd)" },
      },
      output: {
        schema: { type: "string" },
        render: (_args: any, value: string) => [{ type: "text", text: value }],
      },
      async execute(args: { project?: string }) {
        return runWikiskill(["status", "--project", projectOf(args)], projectOf(args));
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "wiki_trace",
      description:
        "Log one tool execution to WikiSkill's raw trace layer for later evolution analysis. Call after any non-trivial tool call (edit, command, search that changed your plan).",
      parameters: {
        tool: { type: "string", required: true, description: "Name of the tool that ran" },
        status: { type: "string", description: "'completed' or 'error' (default completed)" },
        input: { type: "string", description: "JSON-encoded tool input (optional)" },
        result: { type: "string", description: "JSON-encoded tool result (optional)" },
        session: { type: "string", description: "Session id (optional)" },
        project: { type: "string", description: "Project directory (default: harness cwd)" },
      },
      output: {
        schema: { type: "string" },
        render: (_args: any, value: string) => [{ type: "text", text: value }],
      },
      async execute(args: {
        tool: string;
        status?: string;
        input?: string;
        result?: string;
        session?: string;
        project?: string;
      }) {
        const argv = ["trace-manual", "--tool", args.tool, "--project", projectOf(args)];
        if (args.status) argv.push("--status", args.status);
        if (args.input) argv.push("--input", args.input);
        if (args.result) argv.push("--result", args.result);
        if (args.session) argv.push("--session", args.session);
        await runWikiskill(argv, projectOf(args));
        return "trace logged";
      },
    }),
  );

  ctx.tools.register(
    defineTool({
      name: "wiki_evolve_prompt",
      description:
        "Start one WikiSkill evolution iteration: prints the step-by-step evolution instructions (analyze traces → update wiki → propose skill → validate → gate). Follow the printed steps with your file tools, then the iteration closes via the evolve-complete path in the instructions.",
      parameters: {
        project: { type: "string", description: "Project directory (default: harness cwd)" },
        sampleSize: { type: "string", description: "Traces to sample (default 20)" },
      },
      output: {
        schema: { type: "string" },
        render: (_args: any, value: string) => [{ type: "text", text: value }],
      },
      async execute(args: { project?: string; sampleSize?: string }) {
        const argv = ["evolve-prompt", "--project", projectOf(args)];
        if (args.sampleSize) argv.push("--sample-size", args.sampleSize);
        return runWikiskill(argv, projectOf(args));
      },
    }),
  );

  // Human slash-commands — only when an interactive profile mounts `commands`.
  if (ctx.commands) {
    const cmd = (cmdName: string, description: string, cliArgs: string[]) => {
      ctx.commands.register({
        name: cmdName,
        description,
        handler: async (invocation: any) => {
          const cwd = invocation?.agent?.options?.cwd ?? process.cwd();
          try {
            const text = await runWikiskill([...cliArgs, "--project", cwd], cwd);
            return { kind: "success", text };
          } catch (err) {
            return { kind: "error", text: err instanceof Error ? err.message : String(err) };
          }
        },
      });
    };
    cmd("wiki-status", "Show WikiSkill evolution status and statistics", ["status"]);
    cmd("wiki-evolve", "Run one WikiSkill evolution iteration", ["evolve-prompt"]);
    cmd("wiki-reset", "Reset WikiSkill evolution state (keeps wiki patterns)", ["reset"]);
  }
}
