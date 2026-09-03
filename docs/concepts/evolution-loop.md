# Evolution Loop

The core of WikiSkill is the evolution loop (Algorithm 1). Each iteration has four stages:

```
tasks ──► Inference Agent ──► raw/traces/ (immutable)
                   │
                   ▼
           Wiki Maintainer ──► wiki/patterns/ (persistent)
                   │
                   ▼
           Skill Proposer ──► proposal (create/patch)
                   │
                   ▼
                GATE ──► R_val > R_best? ──yes──► keep, update R_best
                         │ no
                         ▼
                   rollback skills; wiki retained
```

## Stage 1: Inference Agent

Runs training tasks with the current skill set, producing execution traces. The agent **only sees active skills** — never the raw wiki (paper §3.2.1). This prevents "cheating" by reading its own analysis.

## Stage 2: Wiki Maintainer

Analyzes traces and distills patterns:
- Samples up to 8 traces (5 failing + 3 passing, per paper §C)
- Creates/updates pattern pages in `wiki/patterns/`
- Updates `wiki/index.md` and `wiki/logs.md`

## Stage 3: Skill Proposer

Reads the wiki and traces, proposes exactly ONE skill change:
- Create a new skill, OR
- Edit an existing skill

Uses ReAct-style reasoning with `read_file` tool access (paper §3.2.3).

## Stage 4: Gating & Rollback

Validates the proposal on held-out tasks:
- `R_val > R_best` → **ACCEPTED** (keep skill, update R_best)
- `R_val ≤ R_best` → **REJECTED** (rollback skill)

**The wiki is never rolled back.** Rejected proposals are recorded in `wiki/skill-impact.md` so future proposers don't repeat them.

## Run it

```sh
wikiskill evolve --iters 5
```

Runs the full loop autonomously. No manual prompting between stages.
