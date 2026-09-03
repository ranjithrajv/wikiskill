# Quickstart

Get WikiSkill running in 60 seconds.

## 1. Install

```sh
npm install --save-dev wikiskill
```

Postinstall auto-detects your harness (OpenCode, Claude Code, Codex CLI, Pi, or Hermes) and wires it. No manual config needed.

## 2. Create a workspace

```sh
wikiskill workspace-init demo
```

This creates an isolated evolution environment at `workspaces/demo/` with:

- `.wikiskill/` — raw traces, wiki, skills, state
- `bench/` — 11 auto-graded tasks (7 train / 4 val)
- `profile/` — isolated agent profile
- `runs/` — per-run output

## 3. Run evolution

```sh
cd workspaces/demo
wikiskill evolve --iters 3
```

This runs the **full Algorithm 1 loop** autonomously:

1. **Inference Agent** runs training tasks → produces traces
2. **Wiki Maintainer** analyzes traces → updates wiki patterns
3. **Skill Proposer** reads wiki → proposes skill change
4. **Gating** validates on held-out tasks → accept or rollback

Each iteration prints a summary:

```
Iteration 1:
  Maintainer: created 3 patterns (2 failure, 1 success)
  Proposer: proposed "exact-match-grading.md" (edit)
  Gate: R_val=0.889 vs R_best=0.667 → ACCEPTED
  Skills: 1 active, 0 pending
```

## 4. Check status

```sh
wikiskill status
```

Shows: iteration count, best score, active skills, wiki patterns, evolution history.

## 5. Transfer skills

Evolved skills are portable. Transfer them to another workspace or harness:

```sh
wikiskill transfer demo production
```

## Next steps

- [Bench tasks](bench.md) — add your own auto-graded tasks
- [Cron](cron.md) — schedule overnight evolution
- [Compare](compare.md) — statistical comparison of two runs
- [Tap](tap.md) — install distilled patterns from live runs
