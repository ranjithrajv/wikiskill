---
name: WikiSkill
description: Persistent knowledge base for agent skill evolution — learn from execution patterns and improve skills over time
metadata:
  opencode/autoinvoke: false
---

# WikiSkill

You have access to a **persistent knowledge base** (wiki) that accumulates patterns from past execution experiences. This system helps you learn from successes and failures, evolving skills that compound over time.

## When This Skill Is Useful

- You notice recurring errors or failure patterns in your work
- You want to codify a successful approach into a reusable skill
- You want to review what has been tried before and what worked

## Wiki Structure

The wiki lives at `.wikiskill/` and contains:

| Directory              | Purpose                                         | Mutability                     |
| ---------------------- | ----------------------------------------------- | ------------------------------ |
| `raw/`                 | Execution traces from past tool calls           | Read-only (immutable)          |
| `wiki/patterns/`       | Documented failure modes and success strategies | Persistent (never rolled back) |
| `wiki/index.md`        | Catalog of all current patterns                 | Auto-rebuilt                   |
| `wiki/logs.md`         | Evolution log with iteration summaries          | Append-only                    |
| `wiki/skill-impact.md` | History of accepted/rejected skill proposals    | Append-only                    |
| `skills/`              | Evolved procedural skills                       | Updated with gating            |

## How to Use

### Review Wiki Patterns

```
Read .wikiskill/wiki/index.md to see all documented patterns.
Read individual patterns in .wikiskill/wiki/patterns/<id>.md.
```

### Check What's Been Tried

```
Read .wikiskill/wiki/skill-impact.md to see past proposals and outcomes.
Avoid re-proposing edits that were previously rejected.
```

### Add a New Pattern

If you observe a recurring pattern during your work:

1. Create a new file in `.wikiskill/wiki/patterns/`
2. Use the format:

```markdown
# <Pattern Title>

Category: <failure|success|strategy>

## Description

<What this pattern describes>

## Actionable

<What an agent should do (or avoid) based on this pattern>

## Evidence

- <Observation that supports this pattern>
```

3. Update `.wikiskill/wiki/index.md` with the new pattern

### Evolve Skills

Run `/wiki-evolve` to trigger one iteration of the evolution loop. This will:

1. Analyze recent execution traces
2. Update wiki patterns
3. Propose a skill improvement
4. Validate and gate the proposal
5. Accept improvements or rollback failures

### Check Status

Run `/wiki-status` to see current evolution statistics.

## Key Principles

1. **Knowledge compounds** — The wiki never rolls back, even if a skill edit fails
2. **Skills are distilled** — The wiki is for evolution; only refined skills are exposed
3. **Failures teach** — Documented failure patterns prevent repeating the same mistakes
4. **Evidence-based** — Every pattern must cite specific traces as evidence
