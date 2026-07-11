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
      fit: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "How genuinely the chosen markets express the thesis. <50 = forced proxies, no real coverage.",
      },
      fitReason: { type: "string", description: "One honest sentence explaining the fit score" },
      legs: {
        type: "array",
        minItems: 0,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            ticker: { type: "string" },
            side: { type: "string", enum: ["yes", "no"] },
            weight: { type: "integer", minimum: 5, maximum: 50 },
            relevance: {
              type: "integer",
              minimum: 0,
              maximum: 100,
              description: "How directly this market expresses the thesis. <45 = tangential stretch.",
            },
            rationale: { type: "string", description: "Max 12 words: why this market expresses the thesis" },
          },
          required: ["ticker", "side", "weight", "relevance", "rationale"],
        },
      },
    },
    required: ["name", "summary", "fit", "fitReason", "legs"],
  },
};

const Out = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  fit: z.number(),
  fitReason: z.string(),
  legs: z
    .array(
      z.object({
        ticker: z.string(),
        side: z.enum(["yes", "no"]),
        weight: z.number(),
        relevance: z.number(),
        rationale: z.string(),
      })
    )
    .max(10),
});

export class NoFitError extends Error {}

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
- Pick 3-10 markets that genuinely express the thesis. Only tickers from the list.
- side: "yes" if the thesis implies the event happens, "no" if it implies it won't.
- weight: how central the market is to the thesis (integers, aim to sum to 100).
- Prefer higher-volume markets. Avoid sports unless the thesis is about sports.
- Score each leg's relevance HONESTLY: 100 = directly expresses the thesis, <45 = tangential stretch.
- Markets need NOT mention the thesis's exact mechanism — same domain + same direction counts as relevant.
  "AI is accelerating" is WELL expressed by markets on model release timing, lab rankings, capability scores
  (relevance 70+). That basket has fit 70+.
- Descriptive or enthusiastic text has an IMPLIED direction — extract it. A paragraph praising a company's
  product/paradigm = bullish that company: markets on its rankings, milestones, valuation, and its rivals'
  decline are legitimate legs (relevance 55-75, fit 55-70). Same for pessimistic text = bearish.
- The subject's own company/sector markets are NEVER "loose proxies" — they are the tradable expression of
  the thesis. Only CROSS-DOMAIN legs are stretches.
- fit < 50 is ONLY for: jokes, personal grievances, pure vibes with no subject, or theses whose subject has
  zero markets in its domain, where every leg would be a cross-domain stretch (e.g. "Switzerland is
  German-speaking" for an anti-Germany rant). Declining those is a GOOD outcome: return fit < 50, short/empty
  legs, explain in fitReason.
- If the domain has real coverage, BUILD THE BASKET. Do not decline for imperfect coverage.
- Match time horizons: a thesis about a long-run trend should prefer the LONGEST-dated markets available and
  down-weight near-term binaries (a 6-week market is a stronger claim than "this direction continues").
  State the basket's effective horizon in the summary, e.g. "expressed over a Jul-Dec 2026 horizon".

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

    // The no-fit gate: below-threshold fit or too few genuinely relevant legs → decline.
    if (parsed.data.fit < 50) {
      throw new NoFitError(parsed.data.fitReason || "no live markets genuinely express this thesis");
    }
    const legs = parsed.data.legs.filter((l) => byTicker.has(l.ticker) && l.relevance >= 45);
    if (legs.length < 3) {
      if (parsed.data.legs.length >= 3) {
        throw new NoFitError(parsed.data.fitReason || "only tangential proxy markets found for this thesis");
      }
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
        endDate: m.endDate,
      };
    });
    full.sort((a, b) => b.weight - a.weight);

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
