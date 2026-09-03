// ─── WikiSkill: OpenCode Plugin ────────────────────────────────────────────────
// "Compiling Agent Experience into Persistent Knowledge for Skill Evolution"
//
// Based on: Tang et al., 2026 — arXiv:2608.27454
//
// This plugin implements the WikiSkill framework for OpenCode, mapping its
// four components to OpenCode's plugin API:
//
//   WikiSkill Component         → OpenCode Mechanism
//   ──────────────────────────    ─────────────────────────────────
//   Raw Layer (traces)          → tool.hook("execute.after") + filesystem
//   Wiki Layer (knowledge)      → filesystem + ctx.storage
//   Skills Layer (procedures)   → ctx.skill.transform() + filesystem
//   Wiki Maintainer             → ctx.session.prompt() (LLM analysis)
//   Skill Proposer              → ctx.session.prompt() (ReAct agent)
//   Gating & Rollback           → Validation scoring + accept/revert
//   Evolution Loop              → /wiki-evolve command
//
// Key design principles from the paper:
// 1. The wiki NEVER rolls back — knowledge compounds across iterations
// 2. The inference agent does NOT access the wiki — only skills
// 3. Skills are the distilled output; the wiki is for evolution only

import { Plugin } from "@opencode-ai/plugin";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import type { PluginState, WikiSkillOptions } from "../../core/types.js";
import {
  INITIAL_STATE,
  DEFAULT_OPTIONS,
  serializeState,
  deserializeState,
  wikiRoot,
  tracesRoot,
  skillsRoot,
  ensureWiki,
  listPatterns,
  readEvolutionLog,
  ensureTraces,
  appendTrace,
  traceStats,
  pruneTraces,
  buildEvolutionPrompt,
  buildStatusText,
} from "../../core/index.js";

export default Plugin.define({
  id: "wikiskill",

  async setup(ctx) {
    const pluginDir = ctx.location.directory;
    const projectDir = ctx.location.project?.directory ?? pluginDir;
    const opts: Required<WikiSkillOptions> = {
      ...DEFAULT_OPTIONS,
      ...(ctx.options as WikiSkillOptions | undefined),
    };

    // Resolve directories
    const wikiDir = wikiRoot(projectDir);
    const rawDir = tracesRoot(projectDir);
    const skillsDir = skillsRoot(projectDir);

    // Ensure filesystem exists
    await ensureWiki(wikiDir);
    await ensureTraces(rawDir);
    await fs.mkdir(skillsDir, { recursive: true });

    // Load persisted state
    let state: PluginState = INITIAL_STATE;
    const saved = (await ctx.storage.get("state")) as Record<string, unknown> | undefined;
    if (saved) state = deserializeState(saved);

    // ─── Tool Hook: Capture Traces (Raw Layer) ────────────────────────────
    await ctx.tool.hook("execute.after", async (event) => {
      // Capture every tool execution as a trace entry
      const entry = {
        id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        sessionID: (event as any).sessionID ?? "unknown",
        tool: event.tool,
        input: event.input,
        result:
          event.status === "completed" ? event.result : { error: (event as any).error?.message },
        status: event.status as "completed" | "error",
      };
      await appendTrace(rawDir, entry).catch((err) => {
        if (opts.verbose) console.error("[WikiSkill] trace capture error:", err.message);
      });
    });

    // ─── Command: /wiki-evolve ────────────────────────────────────────────
    await ctx.command.transform((draft) => {
      draft.add({
        name: "wiki-evolve",
        description:
          "Run one WikiSkill evolution iteration: analyze traces → update wiki → propose skill → validate → gate",
        execute: async ({ sessionID, delivery }) => {
          if (state.evolving) {
            await ctx.session.prompt({
              sessionID,
              text: "⚠️ WikiSkill evolution is already in progress. Please wait for it to complete.",
              delivery: "steer",
            });
            return;
          }

          if (state.iteration >= opts.maxIterations) {
            await ctx.session.prompt({
              sessionID,
              text: `⚠️ WikiSkill has reached the maximum iteration limit (${opts.maxIterations}). Use \`/wiki-reset\` to start over.`,
              delivery: "steer",
            });
            return;
          }

          state.evolving = true;
          state.iteration++;
          await ctx.storage.set("state", serializeState(state) as any);

          // Run the full evolution loop in the current session
          const iterationPrompt = buildEvolutionPrompt(
            state.iteration,
            projectDir,
            opts.sampleSize,
          );
          await ctx.session.prompt({
            sessionID,
            text: iterationPrompt,
            delivery: delivery,
          });
        },
      });

      draft.add({
        name: "wiki-status",
        description: "Show WikiSkill evolution status and statistics",
        execute: async ({ sessionID, delivery }) => {
          const stats = await traceStats(rawDir);
          const patterns = await listPatterns(wikiDir);
          const log = await readEvolutionLog(wikiDir);

          const statusText = buildStatusText({
            iteration: state.iteration,
            maxIterations: opts.maxIterations,
            bestScore: state.bestScore,
            patternCount: patterns.length,
            totalTraces: stats.totalTraces,
            sessions: stats.sessions,
            successRate: stats.successRate,
            accepted: state.impactHistory.filter((h) => h.outcome === "accepted").length,
            rejected: state.impactHistory.filter((h) => h.outcome === "rejected").length,
            recentPatterns: patterns
              .slice(-5)
              .map((p) => ({ title: p.title, category: p.category })),
            logTail: log,
          });

          await ctx.session.prompt({
            sessionID,
            text: statusText,
            delivery: delivery,
          });
        },
      });

      draft.add({
        name: "wiki-reset",
        description: "Reset WikiSkill evolution state (keeps wiki patterns)",
        execute: async ({ sessionID, delivery }) => {
          state = { ...INITIAL_STATE, impactHistory: [] };
          await ctx.storage.set("state", serializeState(state) as any);
          await ctx.session.prompt({
            sessionID,
            text: "✅ WikiSkill state reset. Wiki patterns and raw traces are preserved.",
            delivery: delivery,
          });
        },
      });
    });

    // ─── Register the framework skill + evolved skills ────────────────────
    // ctx.skill.transform's callback is synchronous (not Promise<void>), so
    // this reads with the sync fs API rather than fs/promises — that's what
    // lets a plain `ctx.skill.reload()` re-run this and pick up whatever
    // changed in skillsDir since the last registration, with no extra
    // bookkeeping needed here.
    await ctx.skill.transform((draft) => {
      const frameworkSkillPath = path.join(pluginDir, "skills", "wikiskill", "SKILL.md");
      try {
        draft.add({
          id: "wikiskill",
          name: "WikiSkill",
          description: "Persistent knowledge base for agent skill evolution",
          location: frameworkSkillPath,
          content: fsSync.readFileSync(frameworkSkillPath, "utf-8"),
        } as any);
      } catch {
        // Package didn't ship skills/wikiskill/SKILL.md at this location — skip, not fatal.
      }

      try {
        for (const file of fsSync.readdirSync(skillsDir)) {
          if (!file.endsWith(".md")) continue;
          const location = path.join(skillsDir, file);
          draft.add({
            id: file.replace(/\.md$/, ""),
            name: file.replace(/\.md$/, ""),
            location,
            content: fsSync.readFileSync(location, "utf-8"),
          } as any);
        }
      } catch {
        // No evolved skills yet.
      }
    });

    // ─── Event subscription for evolution completion ──────────────────────
    const controller = new AbortController();
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === "rpc.wikiskill.evolution_completed") {
          // Reload skills after evolution
          await ctx.skill.reload();
          await pruneTraces(rawDir, 3);
        }
      }
    })();

    // ─── Cleanup ──────────────────────────────────────────────────────────
    return () => {
      controller.abort();
    };
  },
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse the Wiki Maintainer's LLM output and apply it to the wiki.
 *
 * The maintainer is instructed to write pattern files and log entries
 * using the filesystem. This function handles any supplementary
 * pattern extraction from the text output.
 */
async function _applyMaintainerOutputFromLLM(projectDir: string, output: string): Promise<void> {
  // The maintainer should have written files directly via tools.
  // This is a safety net: if it describes patterns in its text output
  // but didn't write files, we extract them.
  const patternMatches = output.matchAll(/```(?:pattern|markdown)\s*\n# (.+?)\n([\s\S]*?)```/g);

  const root = wikiRoot(projectDir);
  let created = 0;

  for (const match of patternMatches) {
    const title = match[1];
    const content = match[2];
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 60);
    const category =
      content.match(/Category:\s*(failure|success|strategy)/i)?.[1]?.toLowerCase() ?? "failure";
    const id = `${category}-${slug}`;

    const patternContent = `# ${title}\n\nCategory: ${category}\n\n${content}`;
    const { writePattern } = await import("../../core/wiki-manager.js");
    await writePattern(root, `${id}.md`, patternContent);
    created++;
  }

  if (created > 0) {
    const { rebuildIndex } = await import("../../core/wiki-manager.js");
    await rebuildIndex(root);
  }
}
