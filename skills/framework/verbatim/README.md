# WikiSkill — Verbatim Appendix E Prompts

This directory contains the **exact prompts** from the WikiSkill paper (Tang et al., 2026, Google Research), extracted verbatim from Appendix E.

## Source

Paper: [WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution](https://arxiv.org/abs/2608.27454)
Authors: Liyan Tang, Cyrus Rashtchian, Chun-Sung Ferng, Andrew Tomkins, Da-Cheng Juan, Tu Vu (Google Research)

## Files

| File | Paper Appendix | Purpose |
|------|---------------|---------|
| `maintainer.md` | E.2 | Wiki Maintainer agent system prompt |
| `proposer.md` | E.3 | Skill Proposer agent system prompt (ReAct mode) |
| `inference-livemath.md` | E.1 | Inference Agent for LiveMathematicianBench |
| `inference-sealqa.md` | E.1 | Inference Agent for SealQA |
| `inference-spreadsheet.md` | E.1 | Inference Agent for SpreadsheetBench |
| `inference-officeqa.md` | E.1 | Inference Agent for OfficeQA |
| `inference-alfworld.md` | E.1 | Inference Agent for ALFWorld |

## Usage

These prompts are loaded by the evolution engine:

```typescript
import { maintainerPrompt, proposerPrompt } from './prompts/verbatim';

// Used by WikiMaintainer agent
const maintainerSystemPrompt = maintainerPrompt;

// Used by Skill Proposer agent (ReAct mode)
const proposerSystemPrompt = proposerPrompt;
```

## Fidelity note

These prompts are reproduced verbatim from the paper's Appendix E. Minor formatting adjustments (markdown headings, code fences) have been made for readability, but the instructional content is identical to the source.

All credit for prompt design belongs to the Google Research authors.
