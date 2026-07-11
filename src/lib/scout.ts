import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { COMPILE_MODEL } from "./compiler";

// Stage 1 of the compile: read ONLY the thesis, emit structured search intent.
// The selector then shops from a catalog narrowed by these terms instead of
// naive substring matching on the raw text.

export interface ScoutResult {
  stance: string;
  direction: "bullish" | "bearish" | "mixed";
  subjects: string[];
  searchTerms: string[];
  domains: string[];
}

const TOOL_NAME = "emit_search_intent";
const TOOL = {
  name: TOOL_NAME,
  description: "Emit structured search intent extracted from the thesis.",
  input_schema: {
    type: "object" as const,
    properties: {
      stance: { type: "string", description: "One sentence: the core belief, with implied direction made explicit" },
      direction: { type: "string", enum: ["bullish", "bearish", "mixed"] },
      subjects: { type: "array", items: { type: "string" }, description: "Entities/topics the thesis is about" },
      searchTerms: {
        type: "array",
        minItems: 8,
        maxItems: 18,
        items: { type: "string" },
        description:
          "Single words or short phrases likely to appear in prediction-market TITLES expressing this thesis: entities, synonyms, drivers, AND second-order consequences (e.g. jobs thesis → 'recession', 'unemployment', 'layoffs', 'GDP').",
      },
      domains: { type: "array", items: { type: "string" }, description: "e.g. AI, macro, crypto, politics" },
    },
    required: ["stance", "direction", "subjects", "searchTerms", "domains"],
  },
};

const Out = z.object({
  stance: z.string().min(1),
  direction: z.enum(["bullish", "bearish", "mixed"]),
  subjects: z.array(z.string()),
  searchTerms: z.array(z.string()).min(4),
  domains: z.array(z.string()),
});

// Null on any failure — caller falls back to the legacy keyword path.
export async function scoutThesis(thesis: string): Promise<ScoutResult | null> {
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: COMPILE_MODEL,
      max_tokens: 700,
      temperature: 0,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: `Extract search intent from this thesis (may be a tweet, rant, or transcript — find the core tradable belief):
"""
${thesis.slice(0, 6000)}
"""
Think about what prediction-market titles would express this thesis: direct subjects, their rivals, upstream drivers, and downstream consequences. Call ${TOOL_NAME}.`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    const parsed = Out.safeParse(block && "input" in block ? block.input : null);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
