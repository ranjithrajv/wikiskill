# Benchmark Results

Results from running WikiSkill on the paper's 5 benchmarks (Table 1 reproduction).

## Methodology

- 5 benchmarks: LiveMath, SealQA, SpreadSheet, OfficeQA, ALFWorld
- 5 models: Qwen-3.5-4B, Qwen-3.5-9B, Qwen-3.6-27B, Gemma-4-31B, Gemini-3.5-Flash
- All methods start with empty skill set (S₀ = ∅)
- Evolved skills injected into inference agent prompt at inference time
- Scores averaged across 3 independent runs
- Statistical significance via paired bootstrap (1000 iterations, p<0.05)

## Results: Baseline vs WikiSkill

| Model | Benchmark | Baseline | WikiSkill | Δ |
|-------|-----------|----------|-----------|---|
| **Qwen-3.5-4B** | LiveMath | 29.1 | 49.7 | **+20.6** |
| | SealQA | 32.5 | 39.4 | **+6.9** |
| | SpreadSheet | 14.6 | 21.1 | **+6.5** |
| | OfficeQA | 30.2 | 28.5 | -1.7 |
| | ALFWorld | 24.4 | 53.7 | **+29.3** |
| | **Avg.** | **26.2** | **38.5** | **+12.3** |
| **Qwen-3.5-9B** | LiveMath | 28.2 | 56.3 | **+28.1** |
| | SealQA | 26.3 | 43.1 | **+16.8** |
| | SpreadSheet | 24.3 | 33.6 | **+9.3** |
| | OfficeQA | 35.9 | 40.5 | **+4.6** |
| | ALFWorld | 34.7 | 63.4 | **+28.7** |
| | **Avg.** | **29.9** | **47.4** | **+17.5** |
| **Qwen-3.6-27B** | LiveMath | 33.9 | 61.9 | **+28.0** |
| | SealQA | 27.5 | 41.6 | **+14.1** |
| | SpreadSheet | 40.8 | 81.7 | **+40.9** |
| | OfficeQA | 42.1 | 53.7 | **+11.6** |
| | ALFWorld | 52.8 | 77.6 | **+24.8** |
| | **Avg.** | **39.4** | **63.3** | **+23.9** |
| **Gemma-4-31B** | LiveMath | 33.9 | 56.7 | **+22.8** |
| | SealQA | 30.6 | 41.2 | **+10.6** |
| | SpreadSheet | 48.3 | 68.0 | **+19.7** |
| | OfficeQA | 43.3 | 44.2 | **+0.9** |
| | ALFWorld | 50.4 | 64.4 | **+14.0** |
| | **Avg.** | **41.3** | **54.9** | **+13.6** |
| **Gemini-3.5-Flash** | LiveMath | 33.0 | 72.6 | **+39.6** |
| | SealQA | 29.4 | 44.7 | **+15.3** |
| | SpreadSheet | 50.5 | 76.6 | **+26.1** |
| | OfficeQA | 48.6 | 60.7 | **+12.1** |
| | ALFWorld | 85.9 | 85.9 | 0.0 |
| | **Avg.** | **49.5** | **68.1** | **+18.6** |

## Key Findings

1. **Skill evolution complements model scaling**: Gains increase with model size (+12.3 for 4B → +23.9 for 27B in Qwen family)

2. **Smaller models can beat larger ones**: Qwen-3.5-9B with WikiSkill (47.4%) outperforms Qwen-3.6-27B without skills (39.4%)

3. **Largest gains on weakest models**: +20.6 points on LiveMath for Qwen-3.5-4B

4. **Consistent improvement**: WikiSkill improves over baseline in 22/25 model-benchmark pairs

## Cross-Model Transfer (Table 2)

Skills evolved by one model transfer effectively to another:

| Target Model | Skill Source | ALFWorld | Δ vs No Skill |
|-------------|--------------|----------|---------------|
| Qwen-3.5-9B | Qwen-3.6-27B | 70.2% | +35.5 |
| Qwen-3.5-9B | Self-evolved | 63.4% | +28.7 |
| Qwen-3.6-27B | Qwen-3.5-4B | 72.1% | +19.3 |
| Qwen-3.6-27B | Self-evolved | 77.6% | +24.8 |

> **Insight**: Transferred skills can outperform self-evolved skills (70.2% vs 63.4%), showing skill discovery and skill execution are distinct capabilities.

## Source

Results from: [WikiSkill: Compiling Agent Experience into Persistent Knowledge for Skill Evolution](https://arxiv.org/abs/2608.27454), Tang et al., Google Research, 2026.
