import { NextRequest, NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { compileBasket, NoFitError } from "@/lib/compiler";
import { scoutThesis } from "@/lib/scout";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let thesis = "";
  try {
    const body = await req.json();
    thesis = String(body?.thesis ?? "").trim();
  } catch {
    /* fall through to validation */
  }
  if (thesis.length < 10) {
    return NextResponse.json({ error: "give me a real thesis (10+ chars)" }, { status: 400 });
  }

  try {
    // Stage 1: scout the thesis for search intent; null → legacy keyword path.
    const scout = await scoutThesis(thesis);
    const catalog = await getCatalog(thesis, scout?.searchTerms);
    if (catalog.length < 20) {
      return NextResponse.json({ error: "market catalog unavailable" }, { status: 503 });
    }
    const stance = scout
      ? `Stance: ${scout.stance}\nDirection: ${scout.direction}\nSubjects: ${scout.subjects.join(", ")}`
      : undefined;
    const basket = await compileBasket(thesis, catalog, stance);
    return NextResponse.json({ basket });
  } catch (e) {
    if (e instanceof NoFitError) {
      return NextResponse.json({ noFit: e.message });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "compile failed" }, { status: 500 });
  }
}
