// ─── WikiSkill Core ────────────────────────────────────────────────────────────
// Harness-agnostic engine: filesystem-based Raw/Wiki/Skills layers, gating,
// and prompt builders. No dependency on any specific agent framework —
// adapters (src/adapters/*) wire this into a host's hook/command/session API.

export * from "./paths.js";
export * from "./types.js";
export * from "./state.js";
export * from "./init.js";
export * from "./wiki-manager.js";
export * from "./trace-capture.js";
export * from "./gating.js";
export * from "./skill-proposer.js";
export * from "./wiki-maintainer.js";
export * from "./evolution-prompt.js";
