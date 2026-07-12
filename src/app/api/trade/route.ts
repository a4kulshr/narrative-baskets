import { NextRequest, NextResponse } from "next/server";
import { kalshiFetch, kalshiConfigured, KALSHI_BASE } from "@/lib/kalshi-auth";

export const maxDuration = 60;

interface TradeLeg {
  ticker: string;
  side: "yes" | "no";
  weight: number;
  yesPrice: number;
}

// Enter a basket on Kalshi: budget split by weight, aggressive limit + IOC ≈ market order.
// V2 order API expresses everything on the YES book: buy YES = bid; buy NO at p = ask at 1-p.
export async function POST(req: NextRequest) {
  if (process.env.VENUE !== "kalshi" || !kalshiConfigured()) {
    return NextResponse.json({ error: "kalshi trading not configured" }, { status: 400 });
  }

  let legs: TradeLeg[] = [];
  let budget = 10;
  try {
    const body = await req.json();
    legs = body?.legs ?? [];
    budget = Math.min(Number(body?.budgetDollars) || 10, 100); // hard cap
  } catch {
    /* validated below */
  }
  if (!legs.length) return NextResponse.json({ error: "no legs" }, { status: 400 });

  const balRes = await kalshiFetch("GET", "/portfolio/balance");
  if (!balRes.ok) {
    return NextResponse.json({ error: `balance check failed: ${await balRes.text()}` }, { status: 502 });
  }
  const bal = await balRes.json();

  const results = [];
  for (const leg of legs) {
    const legBudget = (budget * leg.weight) / 100;
    const price = leg.side === "yes" ? leg.yesPrice : 1 - leg.yesPrice;
    // 5c of slippage headroom; IOC so nothing rests. Kalshi's grid is whole
    // cents — mids land on half-cents, so snap toward the aggressive side.
    const limit =
      leg.side === "yes"
        ? Math.min(0.99, Math.ceil((price + 0.05) * 100) / 100)
        : Math.max(0.01, Math.floor((leg.yesPrice - 0.05) * 100) / 100);
    const count = Math.max(0.01, Math.floor((legBudget / price) * 100) / 100);
    const order = {
      ticker: leg.ticker,
      side: leg.side === "yes" ? "bid" : "ask",
      count: count.toFixed(2),
      price: limit.toFixed(4),
      time_in_force: "immediate_or_cancel",
      self_trade_prevention_type: "taker_at_cross",
    };
    const res = await kalshiFetch("POST", "/portfolio/events/orders", order);
    const data = await res.json().catch(() => ({}));
    results.push({
      ticker: leg.ticker,
      side: leg.side,
      ok: res.ok,
      fill_count: data.fill_count ?? null,
      average_fill_price: data.average_fill_price ?? null,
      error: res.ok ? null : JSON.stringify(data).slice(0, 200),
    });
  }

  return NextResponse.json({
    env: KALSHI_BASE.includes("demo") ? "demo" : "PROD",
    balance_dollars: bal.balance_dollars ?? (bal.balance / 100).toFixed(2),
    results,
  });
}
