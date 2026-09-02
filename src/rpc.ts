// ─── WikiSkill RPC ─────────────────────────────────────────────────────────────
// Exposes WikiSkill methods and events to other plugins and clients.
//
// Uses JSON Schema for input/output definitions to ensure compatibility
// with the portable RPC contract.

import { Rpc } from "@opencode-ai/plugin/rpc";

export const WikiSkill = Rpc.define({
  id: "wikiskill",
  methods: {
    /** Get the current evolution state. */
    status: {
      input: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          iteration: { type: "number" },
          bestScore: { type: "number" },
          evolving: { type: "boolean" },
          patternCount: { type: "number" },
          traceCount: { type: "number" },
        },
        required: ["iteration", "bestScore", "evolving", "patternCount", "traceCount"],
        additionalProperties: false,
      },
    },

    /** Trigger one iteration of the evolution loop. */
    evolve: {
      input: {
        type: "object",
        properties: {
          sampleSize: { type: "number" },
        },
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          iteration: { type: "number" },
          accepted: { type: "boolean" },
          score: { type: "number" },
          message: { type: "string" },
        },
        required: ["iteration", "accepted", "score", "message"],
        additionalProperties: false,
      },
      errors: {
        already_evolving: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
          additionalProperties: false,
        },
        max_iterations: {
          type: "object",
          properties: { message: { type: "string" } },
          required: ["message"],
          additionalProperties: false,
        },
      },
    },

    /** List wiki patterns. */
    patterns: {
      input: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          patterns: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                category: { type: "string" },
                description: { type: "string" },
              },
              required: ["id", "title", "category", "description"],
              additionalProperties: false,
            },
          },
        },
        required: ["patterns"],
        additionalProperties: false,
      },
    },

    /** Reset the evolution state. */
    reset: {
      input: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { success: { type: "boolean" } },
        required: ["success"],
        additionalProperties: false,
      },
    },
  },
  events: {
    /** Emitted when evolution starts. */
    evolved_started: {
      schema: {
        type: "object",
        properties: { iteration: { type: "number" } },
        required: ["iteration"],
        additionalProperties: false,
      },
    },
    /** Emitted when evolution completes. */
    evolution_completed: {
      schema: {
        type: "object",
        properties: {
          iteration: { type: "number" },
          accepted: { type: "boolean" },
          score: { type: "number" },
        },
        required: ["iteration", "accepted", "score"],
        additionalProperties: false,
      },
    },
    /** Emitted when a new pattern is discovered. */
    pattern_discovered: {
      schema: {
        type: "object",
        properties: {
          patternId: { type: "string" },
          category: { type: "string" },
        },
        required: ["patternId", "category"],
        additionalProperties: false,
      },
    },
  },
});
