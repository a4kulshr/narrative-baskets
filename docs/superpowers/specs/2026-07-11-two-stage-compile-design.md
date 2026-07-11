# Two-Stage Compile: Scout → Selector

**Date:** 2026-07-11 · **Target:** tonight's hackathon submission · **Approved by:** Akshat

## Problem

Market candidates reach the selector via naive substring matching on the raw thesis
text. Relevant markets that don't share literal words with the thesis (e.g. "US
recession by 2026?" for an AI-jobs thesis) only appear by volume luck. Selection
quality is capped by string luck, and this is the #1 demo pain point.

## Design

Three steps per compile:

1. **Scout (new LLM call, `src/lib/scout.ts`).** Input: thesis only. Output (forced
   tool, temp 0, claude-sonnet-4-6, ~500 tokens): `{ stance, direction, subjects[],
   searchTerms[] (10–15, incl. synonyms/entities/adjacent concepts), domains[] }`.
2. **Narrow (pure code, `catalog.ts`).** Score all ~4,000 cached Gamma markets by
   word-boundary hits against `searchTerms`; keep top ~250 matches + top 150 by
   volume as general context. Replaces the stop-word keyword hack.
3. **Select (existing call, upgraded input).** Same schema and three-tier fit gate
   as today; prompt additionally receives the scout's stance summary.

## Error handling

- Scout call fails or returns unparseable output → fall back to the current
  keyword-matching path (code retained). Compile never gets worse than today.
- Latency budget: +3–5s per compile, acceptable for the demo.

## Out of scope (v2 doc, next week)

Apify tweet-URL ingestion, author/engagement context, influencer watchlist,
sentiment signals (price momentum / volume surges) as displayed context.

## Testing

Rerun the 6 known theses (AI acceleration, Fed panic, Altman jobs tweet, Claude
paragraph, Apple quote, Germany joke) twice each: joke still declines, others build
consistently, leg relevance visibly better on the Altman-jobs case (expect the
recession leg + driver legs to appear by intent, not luck).
