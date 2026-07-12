# PredBasket

**Trade the story, not ten markets.**

Paste a thesis — a rant, a tweet, a transcript — and it compiles into a weighted
basket of real, live prediction markets with a single index value.

**Live demo:** https://narrative-baskets.vercel.app

## What it does

People don't wake up wanting "will X happen by June?" — they wake up believing
*stories*: "AI is accelerating," "the Fed will panic," "crypto regulation is coming."
Narrative Baskets turns a story into a position:

1. **Paste anything** — Sam Altman's latest tweet, a macro rant, a product take.
2. **Scout** (LLM pass 1): extracts the tradable stance — subjects, direction,
   synonyms, and second-order consequences ("AI jobs thesis" → unemployment,
   recession markets).
3. **Narrow**: ~2,500 live Polymarket markets are scored against the scout's
   search terms; the selector shops from a relevant menu, not a lucky one.
4. **Select** (LLM pass 2): picks 4–10 markets, chooses YES/NO per leg, assigns
   weights, and scores its own fit.
5. **Index value** = weighted average of the market prices — *how much the market
   already agrees with the narrative*. Low index + you're right = you get paid.
   High index = the take is priced in.

## Honesty built in

- **Three fit tiers**: clean basket (fit ≥ 60), labeled proxy basket (40–59,
  amber "loose fit" badge), or an outright decline (< 40) with the reason.
  A joke tweet gets refused, not hallucinated into a basket.
- **Dead-weight filter**: markets under 5¢ / over 95¢ are excluded — no
  already-decided legs padding the index.
- **Horizon badge**: every basket states its effective time window. Markets are
  dated instruments; narratives aren't — a deployed agent rolls legs as they
  resolve.

## Execution

A venue-pluggable execution adapter is wired for Kalshi's V2 trading API
(RSA-PSS signed requests, IOC limit orders, balance checks) behind a `VENUE`
flag. Catalog reads are Polymarket (narrative breadth); execution targets a
regulated US venue. Bridging the two is the point.

## Stack

Next.js + TypeScript · Claude (claude-sonnet-4-6, temperature 0, forced tool
output) · Polymarket Gamma API (public) · Kalshi trade API v2 · zero database.

## Run locally

```bash
npm install
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env.local
npm run dev
```

Optional Kalshi execution (demo env):

```bash
# .env.local
KALSHI_API_KEY_ID=...
KALSHI_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

---

Built in one night at a prediction-markets hackathon, on the same compiler
architecture that powers [Akalan](https://akalan-app.vercel.app) — configurable
AI agents for prediction markets.
