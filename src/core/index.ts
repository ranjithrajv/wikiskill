// ─── WikiSkill Core ────────────────────────────────────────────────────────────
// Harness-agnostic engine: filesystem-based Raw/Wiki/Skills layers, gating,
// and prompt builders. No dependency on any specific agent framework —
// adapters (src/adapters/*) wire this into a host's hook/command/session API.

export * from "./paths.js";
export * from "./types.js";
export * from "./state.js";
export * from "./init.js";
export * from "./discover.js";
export * from "./runner.js";
export * from "./bench.js";
export * from "./wiki-manager.js";
export * from "./trace-capture.js";
export * from "./gating.js";
export * from "./skill-proposer.js";
export * from "./wiki-maintainer.js";
export * from "./evolution-prompt.js";
export * from "./workspace.js";
export * from "./compare.js";
export * from "./transfer.js";
export * from "./cron.js";
export * from "./tap.js";

// Re-export bench types from bench.js (the formal bench infrastructure)
// and workspace.js (the demo bench) with distinct names
export type { BenchTask } from "./bench.js";
export type { DemoBenchTask } from "./workspace.js";
