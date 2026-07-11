import type { CatalogMarket } from "./types";
import { KALSHI_BASE } from "./kalshi-auth";

// Kalshi's /markets pagination is unsorted and sports-dominated — blind paging never
// reaches AI/macro/politics. Instead: rank SERIES by lifetime volume (one call),
// take top non-sports series, fetch their open markets in parallel.

interface KalshiSeries {
  ticker?: string;
  category?: string;
  volume_fp?: string | null;
  volume?: number | null;
}

interface KalshiMarket {
  ticker?: string;
  title?: string | null;
  yes_bid_dollars?: string | null;
  yes_ask_dollars?: string | null;
  volume_24h_fp?: string | null;
}

let cache: { at: number; markets: CatalogMarket[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export async function getKalshiCatalog(): Promise<CatalogMarket[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.markets;

  const sRes = await fetch(`${KALSHI_BASE}/series?include_volume=true`, { cache: "no-store" });
  if (!sRes.ok) return [];
  const sData: { series?: KalshiSeries[] } = await sRes.json();

  const topSeries = (sData.series ?? [])
    .filter((s) => s.ticker && s.category !== "Sports")
    .sort((a, b) => Number(b.volume_fp ?? b.volume ?? 0) - Number(a.volume_fp ?? a.volume ?? 0))
    .slice(0, 60)
    .map((s) => s.ticker!);

  const perSeries = await Promise.all(
    topSeries.map(async (ticker) => {
      try {
        const res = await fetch(
          `${KALSHI_BASE}/markets?series_ticker=${encodeURIComponent(ticker)}&status=open&limit=100`,
          { cache: "no-store" }
        );
        if (!res.ok) return [];
        const data: { markets?: KalshiMarket[] } = await res.json();
        const legs: CatalogMarket[] = [];
        for (const m of data.markets ?? []) {
          if (!m.ticker || !m.title) continue;
          const bid = Number(m.yes_bid_dollars);
          const ask = Number(m.yes_ask_dollars);
          if (!Number.isFinite(bid) || !Number.isFinite(ask) || ask <= 0) continue;
          const yes = (bid + ask) / 2;
          if (yes < 0.05 || yes > 0.95) continue; // dead-weight filter
          legs.push({
            ticker: m.ticker,
            title: m.title,
            yesPrice: yes,
            volume: Math.round(Number(m.volume_24h_fp ?? 0)),
          });
        }
        // Cap per series so hourly BTC ladders don't crowd the catalog.
        return legs.sort((a, b) => b.volume - a.volume).slice(0, 8);
      } catch {
        return [];
      }
    })
  );

  const markets = perSeries
    .flat()
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 400);
  cache = { at: Date.now(), markets };
  return markets;
}
