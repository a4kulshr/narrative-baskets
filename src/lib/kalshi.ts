import type { CatalogMarket } from "./types";

// Public no-auth host (same one the Akalan worker polls).
const BASE = process.env.KALSHI_API_BASE ?? "https://api.elections.kalshi.com/trade-api/v2";

// Kalshi is mid-migration on price units: integer cents (62) vs dollar-strings ("0.6200").
function toFraction(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (typeof raw === "string" && raw.includes(".")) return n;
  return n > 1 ? n / 100 : n;
}

interface RawMarket {
  ticker?: string;
  title?: string | null;
  yes_bid?: number | string | null;
  yes_ask?: number | string | null;
  yes_bid_dollars?: string | null;
  yes_ask_dollars?: string | null;
  volume?: number | null;
  volume_fp?: string | null;
}

let cache: { at: number; markets: CatalogMarket[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function getCatalog(): Promise<CatalogMarket[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.markets;

  const out: CatalogMarket[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 6; page++) {
    const url = new URL(`${BASE}/markets`);
    url.searchParams.set("limit", "1000");
    url.searchParams.set("status", "open");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) break;
    const data: { markets?: RawMarket[]; cursor?: string | null } = await res.json();
    for (const m of data.markets ?? []) {
      if (!m.ticker || !m.title) continue;
      const bid = toFraction(m.yes_bid_dollars ?? m.yes_bid);
      const ask = toFraction(m.yes_ask_dollars ?? m.yes_ask);
      if (bid == null || ask == null || ask <= 0) continue;
      const volume = Number(m.volume_fp ?? m.volume ?? 0);
      out.push({ ticker: m.ticker, title: m.title, yesPrice: (bid + ask) / 2, volume });
    }
    cursor = data.cursor ?? undefined;
    if (!cursor) break;
  }

  // Liquid markets only — a basket of dead markets demos badly.
  // Parlay combos have comma-joined leg titles; they're noise for baskets.
  // Cap per series so BTC price ladders don't crowd out politics/AI/econ.
  const perSeries = new Map<string, number>();
  const markets = out
    .filter((m) => m.volume > 0)
    .filter((m) => !m.ticker.includes("PARLAY") && !/,\s*(yes|no)\s/i.test(m.title) && !m.title.includes(",yes"))
    .sort((a, b) => b.volume - a.volume)
    .filter((m) => {
      const series = m.ticker.split("-")[0];
      const n = perSeries.get(series) ?? 0;
      if (n >= 3) return false;
      perSeries.set(series, n + 1);
      return true;
    })
    .slice(0, 400);
  cache = { at: Date.now(), markets };
  return markets;
}
