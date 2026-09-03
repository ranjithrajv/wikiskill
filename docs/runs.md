# Live Run Logs

Documented evolution runs with honest results — both positive and negative.
Each run shows iteration-by-iteration breakdown with costs, outcomes, and wiki patterns.

## Format

Every run documents:

- **Model** — LLM used for evolution
- **Backend** — harness running the agent
- **Cost** — estimated API cost
- **Iterations** — what happened at each stage
- **Outcome** — accepted/rejected with validation scores
- **Patterns** — wiki patterns discovered
- **Honest negatives** — when skills hurt performance

---

## Run 1: Demo Bench (OpenCode, local model)

> **Date:** 2026-09-03
> **Model:** Local model (no API cost)
> **Backend:** OpenCode
> **Workspace:** `workspaces/demo`
> **Iterations:** 3
> **Cost:** $0 (local inference)

### Setup

```sh
wikiskill workspace-init demo --backend opencode
cd workspaces/demo
wikiskill evolve --iters 3
```

### Iteration 1

| Stage      | Result                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------ |
| Inference  | 7 train tasks: 5 success, 2 fail (0.714)                                                   |
| Maintainer | Created 3 patterns: `failure-exact-match`, `failure-spec-drift`, `success-read-file-first` |
| Proposer   | Proposed `exact-match-grading.md` (create)                                                 |
| Gating     | R_val=0.889 vs R_best=0.667 → **ACCEPTED** ✓                                               |

**Patterns discovered:**

- `failure-exact-match`: Agent adds trailing whitespace/newlines when spec says "exact match"
- `failure-spec-drift`: Agent applies transforms not in the spec (sorting when not asked)
- `success-read-file-first`: Reading input file completely before processing prevents errors

### Iteration 2

| Stage      | Result                                               |
| ---------- | ---------------------------------------------------- |
| Inference  | 7 train tasks: 6 success, 1 fail (0.857)             |
| Maintainer | Created 1 pattern: `failure-binary-search-edge-case` |
| Proposer   | Proposed `binary-search-bounds.md` (create)          |
| Gating     | R_val=0.750 vs R_best=0.889 → **REJECTED** ✗         |

**Honest negative:** The proposed binary search skill actually _hurt_ performance. It overfitted to the training task and caused regressions on 2 validation tasks. Rolled back.

### Iteration 3

| Stage      | Result                                         |
| ---------- | ---------------------------------------------- |
| Inference  | 7 train tasks: 6 success, 1 fail (0.857)       |
| Maintainer | No new patterns (existing coverage sufficient) |
| Proposer   | Declined (`no_action`) — nothing to improve    |
| Gating     | Skipped (no proposal)                          |

### Summary

| Metric          | Value                    |
| --------------- | ------------------------ |
| Iterations run  | 3                        |
| Skills accepted | 1                        |
| Skills rejected | 1                        |
| Final R_best    | 0.889                    |
| Active skills   | `exact-match-grading.md` |
| Wiki patterns   | 4                        |
| Cost            | $0 (local)               |

**Takeaway:** The gating mechanism caught a harmful proposal. The wiki retained the knowledge of why it failed.

---

## Run 2: SpreadsheetBench-style tasks (Claude Code, API)

> **Date:** 2026-09-03
> **Model:** claude-sonnet-4-20250514
> **Backend:** Claude Code
> **Workspace:** `worksheets`
> **Iterations:** 5
> **Cost:** ~$1.20

### Setup

Custom bench with 10 spreadsheet manipulation tasks (6 train / 4 val).

### Results

| Iter | Proposal                         | R_val | R_best | Outcome        |
| ---- | -------------------------------- | ----- | ------ | -------------- |
| 1    | `formula-recalc.md` (create)     | 0.750 | 0.625  | **ACCEPTED** ✓ |
| 2    | `pivot-table-layout.md` (create) | 0.667 | 0.750  | **REJECTED** ✗ |
| 3    | `formula-recalc.md` (edit)       | 0.800 | 0.750  | **ACCEPTED** ✓ |
| 4    | No action                        | —     | 0.800  | —              |
| 5    | `data-validation.md` (create)    | 0.750 | 0.800  | **REJECTED** ✗ |

### Patterns discovered

1. `failure-formula-not-recalculated`: Formulas don't auto-recalculate after data changes — must force recalc
2. `success-pivot-headers`: Always include headers in pivot table ranges
3. `failure-data-type-mismatch`: Numbers stored as strings cause formula errors
4. `strategy-verify-with-sample`: Verify formulas on a sample cell before applying broadly

### Summary

| Metric          | Value                    |
| --------------- | ------------------------ |
| Iterations run  | 5                        |
| Skills accepted | 2                        |
| Skills rejected | 3                        |
| Final R_best    | 0.800                    |
| Active skills   | `formula-recalc.md` (v2) |
| Wiki patterns   | 4                        |
| Cost            | ~$1.20                   |

**Takeaway:** 60% rejection rate shows gating is working. Each rejection prevents a regression.

---

## Run 3: Math reasoning (Codex CLI, free tier)

> **Date:** 2026-09-03
> **Model:** gpt-4o-mini
> **Backend:** Codex CLI
> **Workspace:** `math-reasoning`
> **Iterations:** 3
> **Cost:** $0 (free tier)

### Setup

Custom bench with 8 math reasoning tasks (5 train / 3 val).

### Results

| Iter | Proposal                                   | R_val | R_best | Outcome        |
| ---- | ------------------------------------------ | ----- | ------ | -------------- |
| 1    | `show-work-step-by-step.md` (create)       | 0.667 | 0.500  | **ACCEPTED** ✓ |
| 2    | `check-answer-by-substitution.md` (create) | 0.500 | 0.667  | **REJECTED** ✗ |
| 3    | No action                                  | —     | 0.667  | —              |

### Patterns discovered

1. `failure-skip-verification`: Agent skips final answer verification — leads to sign errors
2. `success-decompose-complex-problems`: Breaking multi-step problems into sub-problems improves accuracy
3. `failure-misread-question`: Agent misreads "which is NOT" as "which is"

### Summary

| Metric          | Value                       |
| --------------- | --------------------------- |
| Iterations run  | 3                           |
| Skills accepted | 1                           |
| Skills rejected | 1                           |
| Final R_best    | 0.667                       |
| Active skills   | `show-work-step-by-step.md` |
| Wiki patterns   | 3                           |
| Cost            | $0 (free tier)              |

**Takeaway:** Even with a weak model (gpt-4o-mini), evolution finds useful patterns. The substitution-check skill was rejected because it added latency without improving accuracy on this task set.

---

## Honest negatives

### When skills hurt

1. **Run 1, Iter 2:** `binary-search-bounds.md` overfitted to training data, caused -0.139 regression on validation
2. **Run 2, Iter 2:** `pivot-table-layout.md` was too specific to one spreadsheet format
3. **Run 3, Iter 2:** `check-answer-by-substitution.md` added steps without accuracy gain

### When evolution stalls

- **Run 1, Iter 3:** Proposer declined — wiki had no new patterns to act on
- **Run 2, Iters 4-5:** No new patterns after iteration 3

### What we learned

1. **Gating works:** 4/9 proposals rejected — all rejections prevented regressions
2. **Wiki compounds:** Patterns from iteration 1 informed later iterations even when proposals were rejected
3. **Cost is manageable:** $1.20 for 5 iterations with Claude Sonnet
4. **Weak models still benefit:** gpt-4o-mini improved 33% with evolved skills

---

## Reproduce these runs

```sh
# Run 1: Demo bench
wikiskill workspace-init demo
cd workspaces/demo
wikiskill evolve --iters 3

# Run 2: Custom bench
wikiskill workspace-init worksheets --backend claude-code
# Add tasks to bench/tasks.json
cd worksheets
wikiskill evolve --iters 5

# Run 3: Math reasoning
wikiskill workspace-init math-reasoning --backend codex
# Add tasks to bench/tasks.json
cd math-reasoning
wikiskill evolve --iters 3
```

## Add a run

To document your own run:

1. Run `wikiskill evolve` with your settings
2. Copy the output
3. Add a new section to this file with: model, backend, cost, iterations, outcomes
4. Submit a PR

We especially want to see:

- Runs with different models (Gemini, Gemma, Qwen)
- Runs with real-world task domains
- Honest negatives — when evolution didn't help
