# WikiSkill

> Compile agent experience into a persistent wiki — and let skills evolve themselves.

WikiSkill is a harness-agnostic implementation of [WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution](https://arxiv.org/abs/2608.27454) (Tang et al., Google Research, 2026).

Agents fail. They also _learn_ — but the lessons usually die with the session. WikiSkill fixes that by keeping a **persistent knowledge wiki** alongside the skill set, and running a closed evolution loop:

1. The agent runs **training tasks** with its current skills → raw execution traces
2. A **Wiki Maintainer** distills traces into pattern pages (root causes, fixes)
3. A **Skill Proposer** reads the wiki + traces and proposes one skill change
4. **Gating**: the change is validated on held-out tasks — strictly better → kept; otherwise rolled back

**The wiki is never rolled back.** Knowledge compounds across iterations.

## Why WikiSkill?

- **Harness-agnostic** — works with OpenCode, Claude Code, Codex CLI, Pi, and Hermes
- **Auto-wiring** — `npm install` detects your harness and wires it automatically
- **Self-improving** — skills get better every iteration, proven by held-out validation
- **Portable** — evolved skills transfer across harnesses and models

## Install

```sh
npm install --save-dev wikiskill
```

That's it. Postinstall auto-detects your harness and wires hooks, commands, and skills.

## Quickstart

```sh
# Create an isolated workspace with demo bench
wikiskill workspace-init demo

# Run autonomous evolution (full Algorithm 1 loop)
wikiskill evolve --iters 5

# Check results
wikiskill status
```

## Five Harnesses, One Wiki

<span class="badge badge-oc">OpenCode</span>
<span class="badge badge-cc">Claude Code</span>
<span class="badge badge-cx">Codex CLI</span>
<span class="badge badge-pi">Pi</span>
<span class="badge badge-hx">Hermes</span>

Same evolution engine. Same portable skills. Pick your harness, or switch anytime.
