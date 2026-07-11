import { NextRequest, NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { compileBasket } from "@/lib/compiler";

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
    const catalog = await getCatalog(thesis);
    if (catalog.length < 20) {
      return NextResponse.json({ error: "kalshi catalog unavailable" }, { status: 503 });
    }
    const basket = await compileBasket(thesis, catalog);
    return NextResponse.json({ basket });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "compile failed" }, { status: 500 });
  }
}
