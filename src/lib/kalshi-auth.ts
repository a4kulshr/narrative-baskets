import crypto from "crypto";

// RSA-PSS request signing per docs.kalshi.com/getting_started/quick_start_authenticated_requests
// Sign string: timestamp_ms + METHOD + path (path includes /trade-api/v2, excludes query).

const DEMO = process.env.KALSHI_ENV !== "prod";
export const KALSHI_BASE = DEMO
  ? "https://demo-api.kalshi.co/trade-api/v2"
  : "https://api.elections.kalshi.com/trade-api/v2";

export function kalshiConfigured(): boolean {
  return !!(process.env.KALSHI_API_KEY_ID && process.env.KALSHI_PRIVATE_KEY);
}

export async function kalshiFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const keyId = process.env.KALSHI_API_KEY_ID!;
  // Env vars flatten newlines; PEM needs them back.
  const pem = process.env.KALSHI_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const ts = Date.now().toString();
  const signPath = `/trade-api/v2${path.split("?")[0]}`;
  const sig = crypto
    .sign("sha256", Buffer.from(`${ts}${method}${signPath}`), {
      key: pem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    })
    .toString("base64");

  return fetch(`${KALSHI_BASE}${path}`, {
    method,
    headers: {
      "KALSHI-ACCESS-KEY": keyId,
      "KALSHI-ACCESS-TIMESTAMP": ts,
      "KALSHI-ACCESS-SIGNATURE": sig,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}
