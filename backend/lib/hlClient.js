/**
 * Rate-limited HyperLiquid API client.
 * All HL API calls should go through this module.
 *
 * - Limits to 15 requests per second (900/min, well under HL's 1200/min)
 * - Queues excess requests instead of dropping them
 * - Retries on 429 with exponential backoff
 * - Shared across all route files
 */

import { HL_API_URL } from "./hlConfig.js";

const MAX_PER_SECOND = 15;
const RETRY_DELAYS = [1000, 2000, 5000]; // ms

let tokens = MAX_PER_SECOND;
let lastRefill = Date.now();
const queue = [];
let processing = false;

function refillTokens() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= 1000) {
    tokens = MAX_PER_SECOND;
    lastRefill = now;
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    refillTokens();

    if (tokens <= 0) {
      // Wait until next second for token refill
      const waitMs = 1000 - (Date.now() - lastRefill);
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 50)));
      continue;
    }

    tokens--;
    const { body, resolve, reject } = queue.shift();

    try {
      const result = await fetchWithRetry(body);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  }

  processing = false;
}

async function fetchWithRetry(body, attempt = 0) {
  const res = await fetch(HL_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (res.status === 429 && attempt < RETRY_DELAYS.length) {
    const delay = RETRY_DELAYS[attempt];
    console.warn(`[hlClient] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HL API ${res.status}: ${text.slice(0, 100)}`);
  }

  return res.json();
}

const REQUEST_TIMEOUT = 20_000; // 20s max per hlInfoPost call

/**
 * Make a rate-limited POST to the HyperLiquid /info endpoint.
 * @param {object} body - The request body (e.g. { type: "allMids" })
 * @returns {Promise<any>} The parsed JSON response
 */
/**
 * Fetch the closest available mid price for a coin at a given timestamp.
 * Uses a 1-minute candle window around the target time.
 * Returns the candle close price, or null if unavailable.
 * @param {string} coin
 * @param {number} timestampMs
 * @returns {Promise<number|null>}
 */
export async function fetchPriceAtTime(coin, timestampMs) {
  const startTime = timestampMs - 60_000;
  const endTime = timestampMs + 60_000;
  try {
    const candles = await hlInfoPost({
      type: "candleSnapshot",
      req: { coin, interval: "1m", startTime, endTime },
    });
    if (!Array.isArray(candles) || candles.length === 0) return null;
    // Pick the candle closest to the target timestamp
    const closest = candles.reduce((best, c) => {
      const cMid = (c.t + c.T) / 2;
      const bMid = (best.t + best.T) / 2;
      return Math.abs(cMid - timestampMs) < Math.abs(bMid - timestampMs) ? c : best;
    });
    return closest.c ? parseFloat(closest.c) : null;
  } catch {
    return null;
  }
}

export function hlInfoPost(body) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("hlInfoPost timeout — HL API unresponsive"));
    }, REQUEST_TIMEOUT);

    queue.push({
      body,
      resolve: (val) => { clearTimeout(timer); resolve(val); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    });
    processQueue();
  });
}
