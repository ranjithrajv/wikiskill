// ─── WikiSkill Types ───────────────────────────────────────────────────────────
// Shared type definitions for the WikiSkill plugin.
// Mirrors the three-layer architecture from the paper:
//   Raw Layer  → execution traces (immutable)
//   Wiki Layer → persistent knowledge (compounds across iterations)
//   Skills Layer → evolving procedural knowledge

/** An execution trace captured from a single tool call. */
export interface TraceEntry {
  id: string;
  timestamp: number;
  sessionID: string;
  tool: string;
  input: unknown;
  result: unknown;
  status: "completed" | "error";
  durationMs?: number;
}

/** A batch of traces from one evolution iteration. */
export interface TraceBatch {
  iteration: number;
  traces: TraceEntry[];
  createdAt: number;
}

/** A pattern page in the wiki. */
export interface WikiPattern {
  id: string;
  title: string;
  category: "failure" | "success" | "strategy";
  description: string;
  actionable: string;
  evidence: string[];
  createdAt: number;
  updatedAt: number;
}

/** The wiki layer state. */
export interface WikiState {
  patterns: WikiPattern[];
  evolutionLog: string[];
  iterationCount: number;
}

/** A skill impact record — tracks what happened with each proposed edit. */
export interface SkillImpactRecord {
  iteration: number;
  timestamp: number;
  targetSkill: string;
  proposalSummary: string;
  validationScore: number;
  bestScore: number;
  outcome: "accepted" | "rejected";
  diff?: string;
}

/** The complete plugin state persisted in storage. */
export interface PluginState {
  /** Best validation score seen so far. */
  bestScore: number;
  /** Current evolution iteration. */
  iteration: number;
  /** Whether evolution is in progress. */
  evolving: boolean;
  /** Impact history for all proposals. */
  impactHistory: SkillImpactRecord[];
  /**
   * sha256 of each skills/*.md file's content, taken right before the Skill
   * Proposer runs. `wikiskill validate` diffs the current skills dir against
   * this to find exactly which file(s) the proposer touched, without needing
   * the proposer to report its own target back out-of-band.
   */
  skillSnapshot: Record<string, string>;
}

/** PluginState as a JSON-compatible record for storage. */
export function serializeState(state: PluginState): Record<string, unknown> {
  return {
    bestScore: state.bestScore,
    iteration: state.iteration,
    evolving: state.evolving,
    impactHistory: state.impactHistory,
    skillSnapshot: state.skillSnapshot,
  };
}

/** Parse a PluginState from a storage record. */
export function deserializeState(record: Record<string, unknown> | undefined): PluginState {
  if (!record) return { ...INITIAL_STATE };
  return {
    bestScore: (record.bestScore as number) ?? 0,
    iteration: (record.iteration as number) ?? 0,
    evolving: (record.evolving as boolean) ?? false,
    impactHistory: (record.impactHistory as SkillImpactRecord[]) ?? [],
    skillSnapshot: (record.skillSnapshot as Record<string, string>) ?? {},
  };
}

/** Default initial state. */
export const INITIAL_STATE: PluginState = {
  bestScore: 0,
  iteration: 0,
  evolving: false,
  impactHistory: [],
  skillSnapshot: {},
};

/** WikiSkill configuration options. */
export interface WikiSkillOptions {
  /** How many traces to sample per iteration for the Wiki Maintainer. */
  sampleSize?: number;
  /** Maximum number of patterns to keep in the wiki. */
  maxPatterns?: number;
  /** Maximum evolution iterations. */
  maxIterations?: number;
  /** Max surgical edits per iteration — the textual learning rate Lt. */
  maxEditsPerIteration?: number;
  /** Whether to enable verbose logging. */
  verbose?: boolean;
}

export const DEFAULT_OPTIONS: Required<WikiSkillOptions> = {
  sampleSize: 20,
  maxPatterns: 100,
  maxIterations: 10,
  maxEditsPerIteration: 4,
  verbose: false,
};
