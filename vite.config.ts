import { defineConfig } from "vite-plus";

/// <reference types="vite-plus/types" />

export default defineConfig({
  // ─── Build / Pack ───────────────────────────────────────────────────────────
  // tsdown (via Rolldown) for building the distributable plugin bundle.
  build: {
    // This is a Node.js plugin — not a browser app.
    target: "node20",
    // Entry point for the distributable build.
    entry: "src/index.ts",
    // Output format: ESM for OpenCode's plugin system.
    format: "esm",
    // Generate declaration files for consumers.
    dts: true,
    // Don't bundle the OpenCode plugin SDK — it's provided by the host.
    external: ["@opencode-ai/plugin", "@opencode-ai/plugin/rpc", "@opencode-ai/plugin/promise"],
    // Output directory.
    outDir: "dist",
    // Minify for production builds.
    minify: false,
  },

  // ─── Test (Vitest) ──────────────────────────────────────────────────────────
  test: {
    // Node environment for plugin tests.
    environment: "node",
    // Include test files.
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Exclude node_modules.
    exclude: ["node_modules", "dist"],
  },

  // ─── Lint (Oxc) ─────────────────────────────────────────────────────────────
  lint: {
    ignorePatterns: ["node_modules", "dist"],
  },

  // ─── Format (Oxfmt) ─────────────────────────────────────────────────────────
  format: {
    exclude: ["node_modules", "dist"],
  },
});
