import { createHash } from "node:crypto";
import { validateToken } from "./jwt.js";
import { isTokenRevoked } from "../db/queries/revokedTokens.js";
import { resolveByKeyHash } from "../db/queries/agents.js";

const extractToken = (req) => {
  // Prefer httpOnly cookie, fall back to Authorization header
  if (req.cookies?.perpgame_session) {
    return req.cookies.perpgame_session;
  }
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7);
  }
  return null;
};

// Authenticate and attach claims to req. Returns null claims on failure.
const authenticate = async (req) => {
  const token = extractToken(req);
  if (!token) return null;

  try {
    const claims = validateToken(token);
    if (await isTokenRevoked(claims.jti, claims.sub)) return null;
    return claims;
  } catch {
    return null;
  }
};

// Extract agent API key from X-Agent-Key or Authorization: Bearer pgk_...
// Note: if Authorization header starts with "Bearer pgk_", it is always
// routed to agent auth — JWT auth will NOT be attempted as a fallback.
export const extractAgentKey = (req) => {
  if (req.headers["x-agent-key"]) return req.headers["x-agent-key"];
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer pgk_")) return auth.slice(7);
  return null;
};

// ─── Agent request rate limiter (60/min per key) ────────────────────────────
const agentRateMap = new Map(); // keyHash → { count, resetAt }
const AGENT_RATE_LIMIT = 120;
const AGENT_RATE_WINDOW = 60_000; // 1 minute

function trackAgentRate(keyHash, res) {
  const now = Date.now();
  let entry = agentRateMap.get(keyHash);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + AGENT_RATE_WINDOW };
    agentRateMap.set(keyHash, entry);
  }
  entry.count++;
  const remaining = Math.max(AGENT_RATE_LIMIT - entry.count, 0);
  const reset = Math.ceil(entry.resetAt / 1000);
  res.set("X-RateLimit-Limit", String(AGENT_RATE_LIMIT));
  res.set("X-RateLimit-Remaining", String(remaining));
  res.set("X-RateLimit-Reset", String(reset));
  if (entry.count > AGENT_RATE_LIMIT) return false;
  return true;
}

// Clean stale entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of agentRateMap) {
    if (now > entry.resetAt) agentRateMap.delete(key);
  }
}, 120_000);

// ─── Auth failure rate limiter ──────────────────────────────────────────────
const authFailures = new Map(); // ip → { count, resetAt }
const AUTH_FAIL_LIMIT = 20;
const AUTH_FAIL_WINDOW = 60_000; // 1 minute

function checkAuthRate(ip) {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || now > entry.resetAt) return true;
  return entry.count < AUTH_FAIL_LIMIT;
}

function recordAuthFailure(ip) {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (!entry || now > entry.resetAt) {
    authFailures.set(ip, { count: 1, resetAt: now + AUTH_FAIL_WINDOW });
  } else {
    entry.count++;
  }
}

// Clean stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authFailures) {
    if (now > entry.resetAt) authFailures.delete(ip);
  }
}, 300_000);

// ─── Unified agent key authentication ────────────────────────────────────────
const hashKey = (key) => createHash("sha256").update(key).digest("hex");

// In-memory set of revoked API key hashes (populated on rotation, cleared on restart)
const revokedApiKeyHashes = new Set();
export const revokeApiKeyHash = (hash) => revokedApiKeyHashes.add(hash);

const resolveAgent = async (key, ip) => {
  if (!checkAuthRate(ip)) return null;

  // Reject oversized keys before hashing to prevent CPU DoS
  if (key.length > 256) return null;

  const hash = hashKey(key);

  // Reject keys that have been rotated out
  if (revokedApiKeyHashes.has(hash)) return null;
  const agent = await resolveByKeyHash(hash);

  if (!agent) {
    recordAuthFailure(ip);
    return null;
  }

  return {
    id: agent.id,
    keyHash: hash,
    userAddress: agent.user_address,
    name: agent.name,
    allowedCoins: agent.allowed_coins || [],
    maxLeverage: agent.max_leverage || 10,
    maxPositionUsd: agent.max_position_usd || 10000,
    enabledIndicators: agent.enabled_indicators || null,
    minConfidence: agent.min_confidence ?? 0.5,
  };
};

// Agent key auth — check X-Agent-Key or Authorization: Bearer pgk_...
// Returns "ok" | "invalid" | "rate_limited"
const authenticateAgentKey = async (key, req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const agent = await resolveAgent(key, ip);
  if (!agent) return "invalid";

  if (res && !trackAgentRate(agent.keyHash, res)) return "rate_limited";

  req.agent = agent;
  req.userAddress = agent.userAddress;
  req.isAgent = true;
  return "ok";
};

/**
 * Middleware: require a valid agent API key (no JWT fallback).
 * Attaches req.agent with full agent profile.
 */
export const requireAgentKey = async (req, res, next) => {
  const key = extractAgentKey(req);
  if (!key) {
    return res.status(401).json({ error: "Missing X-Agent-Key header" });
  }

  const result = await authenticateAgentKey(key, req, res);
  if (result === "ok") return next();
  if (result === "rate_limited") {
    return res.status(429).json({ error: "Rate limit exceeded (120 requests/min)" });
  }
  return res.status(401).json({ error: "Invalid agent key" });
};

// Required auth - 401 if not authenticated
export const requireAuth = async (req, res, next) => {
  // Try agent key first — if key is present, don't fall through to JWT
  const agentKey = extractAgentKey(req);
  if (agentKey) {
    const result = await authenticateAgentKey(agentKey, req, res);
    if (result === "ok") return next();
    if (result === "rate_limited") return res.status(429).json({ error: "Rate limit exceeded (120 requests/min)" });
    return res.status(401).json({ error: "Invalid agent key" });
  }

  const claims = await authenticate(req);
  if (!claims) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  req.userAddress = claims.sub;
  req.claims = claims;
  next();
};

// Optional auth - attaches claims if present, continues either way
export const optionalAuth = async (req, res, next) => {
  // Try agent key first
  const agentKey = extractAgentKey(req);
  if (agentKey) {
    const result = await authenticateAgentKey(agentKey, req, res);
    if (result === "ok") return next();
    if (result === "rate_limited") return res.status(429).json({ error: "Rate limit exceeded (120 requests/min)" });
    return res.status(401).json({ error: "Invalid agent key" });
  }

  const claims = await authenticate(req);
  req.userAddress = claims?.sub ?? null;
  req.claims = claims ?? null;
  next();
};

// ─── Admin authorization ────────────────────────────────────────────────────
const ETH_ADDR_RE = /^0x[0-9a-f]{40}$/;
const ADMIN_ADDRESSES = new Set(
  (process.env.ADMIN_ADDRESSES || "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => ETH_ADDR_RE.test(a)),
);

export const isAdmin = (address) => ADMIN_ADDRESSES.has(address);

// Admin auth - 403 if not admin
export const requireAdmin = async (req, res, next) => {
  const claims = await authenticate(req);
  if (!claims) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  if (!isAdmin(claims.sub)) {
    return res.status(403).json({ error: "Admin access required" });
  }

  req.userAddress = claims.sub;
  req.claims = claims;
  next();
};
