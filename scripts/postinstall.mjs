#!/usr/bin/env node
// Best-effort auto-wiring on `npm install` — never fails the install.
// Only completes wiring for a harness whose config already exists in the
// *consuming* project (INIT_CWD); invents nothing on a bare project. See
// src/core/init.ts for the detection/wiring logic this calls into.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, "..", "dist", "cli.mjs");

// No dist/ yet (e.g. installing this repo's own devDependencies pre-build) — skip quietly.
if (!existsSync(cli)) process.exit(0);

// INIT_CWD is the directory `npm install` was actually run from (the
// consumer's project root), not this package's own directory.
const projectDir = process.env.INIT_CWD ?? process.cwd();

const child = spawn(process.execPath, [cli, "init", "--quiet", "--project", projectDir], {
  stdio: "inherit",
});
child.on("exit", () => process.exit(0));
child.on("error", () => process.exit(0));
