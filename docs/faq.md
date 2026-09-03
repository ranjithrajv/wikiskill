# FAQ

## How is this different from just using CLAUDE.md / AGENTS.md?

CLAUDE.md and AGENTS.md are **static** — you write them once, they never change. WikiSkill's wiki **evolves automatically** from agent experience. Skills are validated against held-out tasks, not just written by hand.

## Does it work with my harness?

Yes. WikiSkill supports OpenCode, Claude Code, Codex CLI, Pi, and Hermes. Auto-wiring means `npm install` is all you need.

## What if I switch harnesses?

Skills are portable. Use `wikiskill transfer` to move skills between workspaces, or just point a new harness at the same `.wikiskill/` directory.

## How much does it cost?

Evolution runs your agent on training tasks (LLM API calls). Cost depends on your model and task count. The demo bench with 7 training tasks costs ~$0.05-0.50 per iteration depending on model.

## Is the wiki shared across team members?

Yes. The `.wikiskill/` directory is git-tracked. Everyone on the team benefits from accumulated knowledge and evolved skills.

## What if a skill makes things worse?

The gating mechanism catches this. If a skill hurts validation performance, it's automatically rolled back. The wiki retains the knowledge of why it failed.

## Can I add my own tasks?

Yes. Tasks are plain JSON:

```json
{
  "id": "my-task",
  "split": "train",
  "title": "My custom task",
  "prompt": "...",
  "sandbox": { "input.txt": "..." },
  "grader": { "type": "exact", "file": "output.txt", "expected": "..." }
}
```

## What's the difference from ashutoshsinghpr7/wikiskill?

Both implement the same paper. Differences:

- **WikiSkill (this repo)**: TypeScript/npm, 5 harnesses, auto-wiring, `open` command, demo video
- **ashutoshsinghpr7**: Python/PyPI, 4 harnesses (Hermes-focused), verbatim Appendix E prompts, documented live runs, docs site

Choose based on your preferred language and harness.
