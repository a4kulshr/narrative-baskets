"use client";

import { useEffect, useRef, useState } from "react";
import type { Basket } from "@/lib/types";
import { legPrice } from "@/lib/types";

const EXAMPLES = [
  { label: "AI is accelerating", text: "AI progress is speeding up. Frontier labs will ship faster than anyone expects, regulation won't keep pace, and capability milestones keep falling early." },
  { label: "Fed panic incoming", text: "The economy is weaker than the data shows. The Fed will be forced into emergency cuts, inflation re-accelerates, and markets are underpricing a hard landing." },
  { label: "Crypto regulation wave", text: "US crypto regulation is finally arriving. Expect landmark legislation, aggressive enforcement, and institutional adoption accelerating because of the clarity, not despite it." },
];

const LOADING_LINES = [
  "reading the thesis…",
  "scanning 500 live polymarket markets…",
  "picking markets that express the narrative…",
  "assigning sides and weights…",
  "computing index value…",
];

export default function Home() {
  const [thesis, setThesis] = useState("");
  const [basket, setBasket] = useState<Basket | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadLine, setLoadLine] = useState(0);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadLine((i) => (i + 1) % LOADING_LINES.length), 1800);
    return () => clearInterval(t);
  }, [loading]);

  useEffect(() => {
    if (basket) resultRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [basket]);

  async function compile() {
    if (loading || thesis.trim().length < 10) return;
    setLoading(true);
    setError("");
    setBasket(null);
    setLoadLine(0);
    try {
      const res = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thesis }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "compile failed");
      setBasket(data.basket);
    } catch (e) {
      setError(e instanceof Error ? e.message : "compile failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm tracking-widest text-emerald-400 uppercase">narrative baskets</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">
          Trade the story,<br />not ten markets.
        </h1>
        <p className="mt-3 text-zinc-400">
          Paste a thesis — a rant, a tweet, a transcript. We compile it into a weighted
          basket of real, live Polymarket markets.
        </p>

        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder='e.g. "AI is moving way too fast and nobody is going to stop it…"'
          rows={5}
          className="mt-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 placeholder-zinc-600 outline-none focus:border-emerald-500"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => setThesis(ex.text)}
              className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400 hover:border-emerald-500 hover:text-emerald-400"
            >
              {ex.label}
            </button>
          ))}
          <button
            onClick={compile}
            disabled={loading || thesis.trim().length < 10}
            className="ml-auto rounded-xl bg-emerald-500 px-6 py-2 font-semibold text-zinc-950 disabled:opacity-40"
          >
            {loading ? "compiling…" : "Compile basket →"}
          </button>
        </div>

        {loading && (
          <p className="mt-6 animate-pulse text-sm text-emerald-400">{LOADING_LINES[loadLine]}</p>
        )}
        {error && <p className="mt-6 text-sm text-red-400">{error}</p>}

        {basket && (
          <div ref={resultRef} className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">{basket.name}</h2>
                <p className="mt-1 text-sm text-zinc-400">{basket.summary}</p>
              </div>
              <div className="text-right">
                <p className="text-xs tracking-widest text-zinc-500 uppercase">index value</p>
                <p className="text-4xl font-bold text-emerald-400">
                  {(basket.indexValue * 100).toFixed(0)}
                </p>
              </div>
            </div>

            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs tracking-wider text-zinc-500 uppercase">
                  <th className="pb-2">Market</th>
                  <th className="pb-2">Side</th>
                  <th className="pb-2 text-right">Weight</th>
                  <th className="pb-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {basket.legs.map((l) => (
                  <tr key={l.ticker} className="border-b border-zinc-800/50 align-top">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{l.title}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{l.rationale}</p>
                    </td>
                    <td className="py-3">
                      <span
                        className={
                          l.side === "yes"
                            ? "rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400"
                            : "rounded bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400"
                        }
                      >
                        {l.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 text-right tabular-nums">{l.weight}%</td>
                    <td className="py-3 text-right tabular-nums">{(legPrice(l) * 100).toFixed(0)}¢</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {basket.legs.length} live Polymarket markets · weights sum to 100
              </p>
              <a
                href="https://akalan-app.vercel.app"
                target="_blank"
                className="rounded-xl border border-emerald-500 px-5 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500 hover:text-zinc-950"
              >
                Deploy as an agent on Akalan →
              </a>
            </div>
          </div>
        )}

        <p className="mt-16 text-xs text-zinc-600">
          Built at the hackathon on the Akalan engine — configurable AI agents for prediction markets.
        </p>
      </div>
    </main>
  );
}
