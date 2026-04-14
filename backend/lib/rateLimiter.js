/**
 * Generic in-memory rate limiter factory.
 *
 * @param {object} opts
 * @param {number} opts.limit   - Max requests per window
 * @param {number} opts.window  - Window duration in ms
 * @returns {{ check(key: string): boolean, middleware(keyFn: (req) => string): function }}
 */
export function createRateLimiter({ limit, window: windowMs }) {
  const map = new Map(); // key → { count, resetAt }

  // Purge expired entries every 2 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of map) {
      if (now > entry.resetAt) map.delete(k);
    }
  }, 120_000).unref();

  /** Returns true if the request is allowed, false if rate-limited. */
  function check(key) {
    const now = Date.now();
    let entry = map.get(key);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      map.set(key, entry);
    }
    entry.count++;
    return entry.count <= limit;
  }

  /**
   * Express middleware. keyFn extracts the key from req (defaults to req.ip).
   * Sends 429 when rate-limited; otherwise calls next().
   */
  function middleware(keyFn = (req) => req.ip || req.socket?.remoteAddress || "unknown") {
    return (req, res, next) => {
      if (check(keyFn(req))) return next();
      res.status(429).json({ error: "Too many requests. Try again later." });
    };
  }

  return { check, middleware };
}
