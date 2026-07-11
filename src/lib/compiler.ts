import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Basket, CatalogMarket } from "./types";
import { indexValue } from "./types";

export const COMPILE_MODEL = "claude-sonnet-4-6";

const TOOL_NAME = "emit_basket";
const TOOL = {
  name: TOOL_NAME,
  description: "Emit the compiled narrative basket.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Short index-style name, e.g. 'AI Doom Index'" },
      summary: { type: "string", description: "One sentence: what this basket expresses" },
      legs: {
        type: "array",
        minItems: 4,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            side: { type: "string", enum: ["yes", "no"] },
            weight: { type: "integer", minimum: 5, maximum: 50 },
            rationale: { type: "string", description: "Max 12 words: why this market expresses the thesis" },
          },
          required: ["ticker", "side", "weight", "rationale"],
        },
      },
    },
    required: ["name", "summary", "legs"],
  },
};

const Out = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  legs: z
    .array(
      z.object({
        ticker: z.string(),
        side: z.enum(["yes", "no"]),
        weight: z.number(),
        rationale: z.string(),
      })
    )
    .min(4)
    .max(10),
});

function prompt(thesis: string, catalog: CatalogMarket[]): string {
  const list = catalog
    .map((m) => `${m.ticker} | ${m.title} | yes=${m.yesPrice.toFixed(2)} | vol=${m.volume}`)
    .join("\n");
  return `You compile a narrative/thesis into a weighted basket of REAL prediction markets.

THESIS (may be a rant, tweet, transcript — extract the core belief):
"""
${thesis.slice(0, 6000)}
"""

LIVE PREDICTION MARKETS (Polymarket) (ticker | title | yes price | volume):
${list}

Rules:
- Pick 4-10 markets that genuinely express the thesis. Only tickers from the list.
- side: "yes" if the thesis implies the event happens, "no" if it implies it won't.
- weight: how central the market is to the thesis (integers, aim to sum to 100).
- Prefer higher-volume markets. Avoid sports unless the thesis is about sports.
- If the thesis is too vague or no markets fit, still pick the closest 4 and say so in rationales.

Call ${TOOL_NAME} with the basket.`;
}

export async function compileBasket(thesis: string, catalog: CatalogMarket[]): Promise<Basket> {
  const client = new Anthropic();
  const byTicker = new Map(catalog.map((m) => [m.ticker, m]));

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: COMPILE_MODEL,
      max_tokens: 2000,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [
        {
          role: "user",
          content: prompt(thesis, catalog) + (lastErr ? `\n\nPrevious attempt was invalid (${lastErr}) — fix it.` : ""),
        },
      ],
    });

    const block = res.content.find((b) => b.type === "tool_use");
    const parsed = Out.safeParse(block && "input" in block ? block.input : null);
    if (!parsed.success) {
      lastErr = parsed.error.message.slice(0, 300);
      continue;
    }

    const legs = parsed.data.legs.filter((l) => byTicker.has(l.ticker));
    if (legs.length < 3) {
      lastErr = "fewer than 3 legs matched real tickers — use tickers from the list verbatim";
      continue;
    }

    // Normalize weights to exactly 100 regardless of what the model summed to.
    const total = legs.reduce((s, l) => s + l.weight, 0);
    const full = legs.map((l) => {
      const m = byTicker.get(l.ticker)!;
      return {
        ticker: l.ticker,
        title: m.title,
        side: l.side,
        weight: Math.round((l.weight / total) * 100),
        rationale: l.rationale,
        yesPrice: m.yesPrice,
      };
    });

    return {
      name: parsed.data.name,
      summary: parsed.data.summary,
      thesis,
      legs: full,
      indexValue: indexValue(full),
    };
  }
  throw new Error(`compile failed: ${lastErr || "no valid tool output"}`);
}
