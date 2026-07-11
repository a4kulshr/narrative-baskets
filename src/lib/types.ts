export interface CatalogMarket {
  ticker: string;
  title: string;
  yesPrice: number; // 0–1 mid
  volume: number;
}

export interface Leg {
  ticker: string;
  title: string;
  side: "yes" | "no";
  weight: number; // integer, legs sum to 100
  rationale: string;
  yesPrice: number;
}

export interface Basket {
  name: string;
  summary: string;
  thesis: string;
  legs: Leg[];
  indexValue: number; // Σ weight × side-adjusted price, 0–1
}

export const legPrice = (l: Leg) => (l.side === "yes" ? l.yesPrice : 1 - l.yesPrice);

export const indexValue = (legs: Leg[]) =>
  legs.reduce((s, l) => s + (l.weight / 100) * legPrice(l), 0);
