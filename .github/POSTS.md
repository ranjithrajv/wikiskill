# Announcement Posts

Copy-paste ready for various platforms.

---

## Hacker News (Show HN)

**Title:** Show HN: WikiSkill plugin — OpenCode agents that learn from their mistakes

**Body:**

I turned the WikiSkill paper (Tang et al., Google Research 2026) into an OpenCode plugin. The idea: instead of forgetting what went wrong after each task, your agent accumulates patterns in a persistent wiki and evolves better skills over time.

Three-layer architecture:
- Raw Layer: immutable execution traces from every tool call
- Wiki Layer: persistent patterns (failure modes + success strategies) that never roll back
- Skills Layer: evolved procedural knowledge, updated only when validation improves

The key insight from the paper: even when a skill edit fails, the *lesson* persists in the wiki. Knowledge compounds.

Repo: https://github.com/ranjithrajv/opencode-wikiskill
Paper: https://arxiv.org/abs/2608.27454

Works with any OpenCode project — just add to opencode.jsonc and type /wiki-evolve after a coding session.

---

## Reddit (r/LocalLLaMA, r/AI_Agents)

**Title:** I built an OpenCode plugin that makes agents learn from their mistakes (WikiSkill paper implementation)

**Body:**

The WikiSkill paper from Google Research shows that agents can co-evolve skills with a persistent knowledge base. I implemented it as an OpenCode plugin.

How it works:
1. Your agent works normally — every tool call is traced
2. Run /wiki-evolve — it analyzes traces, finds failure patterns, proposes skill edits
3. Gating validates: accept if score improves, rollback if not
4. The wiki never forgets — even rejected edits leave behind lessons

The result: your agent gets better at your specific codebase over time, without retraining.

GitHub: https://github.com/ranjithrajv/opencode-wikiskill
Paper: https://arxiv.org/abs/2608.27454

---

## Twitter/X

Just published: WikiSkill for OpenCode 🔧

Your agent makes mistakes. Now it learns from them.

I turned the @lytang_ Google Research paper into a plugin:
→ Persistent wiki accumulates failure patterns
→ Skills evolve via /wiki-evolve
→ Knowledge compounds (wiki never rolls back)

Paper: arxiv.org/abs/2608.27454
Plugin: github.com/ranjithrajv/opencode-wikiskill

cc: @karpathy (the paper cites his LLM Wiki concept as inspiration)

---

## OpenCode Discord / IRC

**Message:**

Hey! I just published an OpenCode plugin implementing the WikiSkill paper (Google Research, 2026). It gives your agent a persistent knowledge base that accumulates patterns from execution traces, then evolves better skills over time.

The wiki never rolls back — even when a skill edit fails, the lesson persists. Knowledge compounds.

Install: add to opencode.jsonc, then /wiki-evolve after a session.
Repo: https://github.com/ranjithrajv/opencode-wikiskill
Paper: https://arxiv.org/abs/2608.27454

Would love feedback from the community!
