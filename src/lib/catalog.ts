import type { CatalogMarket } from "./types";

// Polymarket Gamma API: public, no auth, supports volume sort — unlike Kalshi's
// /markets, which returns unsorted pages that are ~99% zero-volume markets.
const GAMMA = "https://gamma-api.polymarket.com/markets";

interface GammaMarket {
  slug?: string;
  question?: string;
  outcomePrices?: string; // JSON '["0.51","0.49"]' — [yes, no]
  volume24hr?: number | string | null;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
}

let cache: { at: number; markets: CatalogMarket[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

async function fetchAll(): Promise<CatalogMarket[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.markets;

  // Gamma silently caps limit at 100 and 422s past offset ~2400 — page honestly,
  // in chunks of 8 to dodge rate limits, with one retry per failed page.
  const fetchPage = async (offset: number): Promise<GammaMarket[]> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `${GAMMA}?order=volume24hr&ascending=false&closed=false&limit=100&offset=${offset}`,
          { cache: "no-store" }
        );
        if (res.ok) return (await res.json()) as GammaMarket[];
      } catch {
        /* retry once */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    return [];
  };
  const offsets = Array.from({ length: 25 }, (_, i) => i * 100);
  const pages: GammaMarket[][] = [];
  for (let i = 0; i < offsets.length; i += 8) {
    pages.push(...(await Promise.all(offsets.slice(i, i + 8).map(fetchPage))));
  }

  const out: CatalogMarket[] = [];
  for (const m of pages.flat()) {
    if (!m.slug || !m.question || m.closed || m.active === false) continue;
    let yes: number | null = null;
    try {
      yes = Number(JSON.parse(m.outcomePrices ?? "[]")[0]);
    } catch {
      continue;
    }
    // 5–95¢ only: near-resolved markets are dead weight in a basket.
    if (yes == null || !Number.isFinite(yes) || yes < 0.05 || yes > 0.95) continue;
    out.push({
      ticker: m.slug,
      title: m.question,
      yesPrice: yes,
      volume: Math.round(Number(m.volume24hr ?? 0)),
      endDate: m.endDate,
    });
  }
  cache = { at: Date.now(), markets: out };
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Top-volume markets alone miss niche narratives (AI, science, tech) — the 24h
// leaderboard is all sports/geopolitics/crypto. So: liquid core + relevance hits.
// With scout terms: score by term hits (best-first). Without: legacy keyword path.
export async function getCatalog(thesis = "", scoutTerms?: string[]): Promise<CatalogMarket[]> {
  // VENUE=kalshi → tradable Kalshi catalog; default Polymarket (read-only, richer titles).
  const all =
    process.env.VENUE === "kalshi"
      ? await (await import("./catalog-kalshi")).getKalshiCatalog()
      : await fetchAll();

  if (scoutTerms?.length) {
    const rx = scoutTerms.map((t) => new RegExp(`\\b${esc(t)}`, t.length <= 3 ? "" : "i"));
    const scored = all
      .map((m) => ({ m, hits: rx.reduce((n, r) => n + (r.test(m.title) ? 1 : 0), 0) }))
      .filter((x) => x.hits > 0)
      .sort((a, b) => b.hits - a.hits || b.m.volume - a.m.volume)
      .slice(0, 250)
      .map((x) => x.m);
    const matchedSet = new Set(scored.map((m) => m.ticker));
    const core = all.filter((m) => !matchedSet.has(m.ticker)).slice(0, 150);
    return [...scored, ...core];
  }

  const core = all.slice(0, 300);
  const words = Array.from(
    new Set(
      thesis
        .split(/[^A-Za-z0-9$]+/)
        .filter((w) => (w.length >= 4 && !STOP.has(w.toLowerCase())) || /^[A-Z]{2,3}$/.test(w))
    )
  );
  const rx = words.map((w) => new RegExp(`\\b${esc(w)}`, w.length <= 3 ? "" : "i"));
  const coreSet = new Set(core.map((m) => m.ticker));
  const matched = all
    .filter((m) => !coreSet.has(m.ticker) && rx.some((r) => r.test(m.title)))
    .slice(0, 250);

  return [...core, ...matched];
}

const STOP = new Set([
  "will", "that", "this", "with", "have", "wont", "from", "they", "them", "than",
  "then", "when", "what", "were", "been", "being", "would", "could", "should",
  "there", "their", "about", "because", "expect", "expects", "anyone", "nobody",
  "going", "keep", "keeps", "pace", "fast", "faster", "early", "everything",
]);
