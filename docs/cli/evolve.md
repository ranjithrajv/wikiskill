# evolve

Run the full Algorithm 1 evolution loop autonomously.

```
wikiskill evolve --iters N [--model M] [--provider P] [--no-early-stop]
```

## What it does

Each iteration runs the complete loop without manual intervention:

1. **Inference** — runs training tasks, captures traces
2. **Maintainer** — analyzes traces, updates wiki patterns
3. **Proposer** — reads wiki, proposes skill change
4. **Gating** — validates on held-out tasks, accepts or rollbacks

## Options

| Flag              | Default | Description                                         |
| ----------------- | ------- | --------------------------------------------------- |
| `--iters`         | `3`     | Number of evolution iterations                      |
| `--model`         | —       | Model to use (e.g., `google/gemini-2.5-flash-lite`) |
| `--provider`      | —       | Provider (e.g., `openrouter`)                       |
| `--no-early-stop` | false   | Don't stop when R_best = 1.0                        |
| `--max-turns`     | `10`    | Max agent turns per task                            |

## Example

```sh
# Run 5 iterations with default model
wikiskill evolve --iters 5

# Use a specific model
wikiskill evolve --iters 3 --model google/gemini-2.5-flash-lite --provider openrouter

# Run without early stopping
wikiskill evolve --iters 10 --no-early-stop
```

## Output

```
=== WikiSkill Evolution ===
Workspace: demo
Backend: opencode
Iterations: 3

Iteration 1/3:
  [1/4] Running inference on 7 training tasks...
       → 5 success, 2 fail (0.714)
  [2/4] Wiki Maintainer analyzing traces...
       → Created 3 patterns: failure-exact-match, failure-spec-drift, success-read-file-first
       → Updated wiki/index.md
  [3/4] Skill Proposer reviewing wiki...
       → Proposed: "exact-match-grading.md" (create)
  [4/4] Gating validation on 4 held-out tasks...
       → R_val=0.889 vs R_best=0.667 → ACCEPTED ✓

Iteration 2/3:
  [1/4] Running inference on 7 training tasks...
       → 6 success, 1 fail (0.857)
  [2/4] Wiki Maintainer analyzing traces...
       → Created 1 pattern: failure-binary-search-edge-case
  [3/4] Skill Proposer reviewing wiki...
       → Proposed: "binary-search-bounds.md" (create)
  [4/4] Gating validation on 4 held-out tasks...
       → R_val=0.750 vs R_best=0.889 → REJECTED ✗ (rollback)

Iteration 3/3:
  [1/4] Running inference on 7 training tasks...
       → 6 success, 1 fail (0.857)
  [2/4] Wiki Maintainer analyzing traces...
       → No new patterns (existing coverage sufficient)
  [3/4] Skill Proposer reviewing wiki...
       → Declined (no_action) — nothing to improve
  [4/4] Skipped (no proposal)

=== Results ===
Iterations run: 3
Skills accepted: 1
Skills rejected: 1
Final R_best: 0.889
Active skills: exact-match-grading.md
Wiki patterns: 4
```

## How it works

The `evolve` command orchestrates the four components of Algorithm 1:

### 1. Inference Agent

Runs each training task in the bench, captures execution traces to `raw/traces/`. The agent only sees the **active skills** — never the raw wiki (per paper §3.2.1).

### 2. Wiki Maintainer

Samples up to 8 traces (5 failing + 3 passing, per paper §C) and distills them into pattern pages. Updates `wiki/patterns/`, `wiki/index.md`, and `wiki/logs.md`.

### 3. Skill Proposer

Reads the wiki index and traces, proposes exactly ONE skill change (create or edit). Uses ReAct-style reasoning with `read_file` tool access.

### 4. Gating

Validates the proposed skill on held-out validation tasks. Accepts only if `R_val > R_best` (strictly better). Rollbacks use `git reset --hard` on reject.

## Early stopping

By default, evolution stops early if `R_best = 1.0` (perfect validation score). Use `--no-early-stop` to always run all iterations.

## See also

- [workspace-init](workspace-init.md) — create a workspace
- [bench](bench.md) — manage bench tasks
- [status](status.md) — view evolution state
- [compare](compare.md) — compare two runs
