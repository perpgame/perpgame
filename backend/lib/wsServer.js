import { createHash } from "node:crypto";
import { WebSocketServer } from "ws";
import { validateToken } from "../auth/jwt.js";
import { isTokenRevoked } from "../db/queries/revokedTokens.js";
import { getAddressByKeyHash } from "../db/queries/agents.js";
import { bufferEvent } from "../db/queries/agentEvents.js";

// ─── State: address → Set<ws> for WebSocket, address → Set<res> for SSE ─────

const connections = new Map();
const sseConnections = new Map();

/**
 * Send a JSON payload to all connections for a user address.
 */
export const sendToUser = (address, payload) => {
  const sockets = connections.get(address);
  if (!sockets?.size) return;
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === 1) ws.send(json);
  }
};

// ─── Connection management ──────────────────────────────────────────────────

const addConnection = (address, ws) => {
  if (!connections.has(address)) connections.set(address, new Set());
  connections.get(address).add(ws);
};

const removeConnection = (address, ws) => {
  const sockets = connections.get(address);
  if (!sockets) return;
  sockets.delete(ws);
  if (sockets.size === 0) connections.delete(address);
};

// ─── Auth ───────────────────────────────────────────────────────────────────

const authenticateToken = async (token) => {
  if (!token) return null;
  try {
    const claims = validateToken(token);
    if (await isTokenRevoked(claims.jti, claims.sub)) return null;
    return claims;
  } catch {
    return null;
  }
};

const authenticateAgentKey = async (apiKey) => {
  if (!apiKey) return null;
  const hash = createHash("sha256").update(apiKey).digest("hex");
  return getAddressByKeyHash(hash);
};

/** Extract token from cookie header (parse manually since ws doesn't use express middleware) */
const extractCookieToken = (req) => {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)perpgame_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

// ─── Client message handling ────────────────────────────────────────────────

const handleClientMessage = (address, data) => {
  const text = data.toString().trim();

  // Simple ping/pong keep-alive
  if (text === "ping") {
    sendToUser(address, "pong");
    return;
  }

  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }

  if (msg.type === "typing" && msg.recipientAddress) {
    sendToUser(msg.recipientAddress, JSON.stringify({
      type: "typing",
      data: {
        senderAddress: address,
        conversationId: msg.conversationId ?? null,
      },
    }));
  }
};

// ─── Server setup ───────────────────────────────────────────────────────────

const PING_INTERVAL = 30_000;

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Clients connect to /ws with ?token=<JWT> or send an auth message.
 * Agents can auth with { type: "auth", apiKey: "pgk_..." }.
 */
const AUTH_TIMEOUT_MS = 5000;

export const attachWsServer = (httpServer) => {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    // Try cookie-based auth first (preferred — no token in URL)
    const cookieToken = extractCookieToken(req);
    let claims = await authenticateToken(cookieToken);

    // If no cookie, also check query param for backward compat
    if (!claims) {
      const url = new URL(req.url, "http://localhost");
      const queryToken = url.searchParams.get("token");
      claims = await authenticateToken(queryToken);
    }

    if (claims) {
      // Authenticated via cookie or query param
      setupAuthenticatedWs(ws, claims.sub);
      return;
    }

    // No auth yet — wait for auth message as first message
    const authTimeout = setTimeout(() => {
      ws.close(4001, "Auth timeout");
    }, AUTH_TIMEOUT_MS);

    ws.once("message", async (data) => {
      clearTimeout(authTimeout);
      try {
        const msg = JSON.parse(data.toString());

        // Agent key auth: { type: "auth", apiKey: "pgk_..." }
        if (msg.type === "auth" && msg.apiKey) {
          const agentAddress = await authenticateAgentKey(msg.apiKey);
          if (agentAddress) {
            ws.send(JSON.stringify({ type: "auth_ok", agentAddress }));
            setupAuthenticatedWs(ws, agentAddress);
            return;
          }
        }

        // JWT auth: { type: "auth", token: "..." }
        if (msg.type === "auth" && msg.token) {
          const authClaims = await authenticateToken(msg.token);
          if (authClaims) {
            ws.send(JSON.stringify({ type: "auth_ok" }));
            setupAuthenticatedWs(ws, authClaims.sub);
            return;
          }
        }
      } catch { /* parse error */ }
      ws.close(4001, "Unauthorized");
    });

    ws.on("error", () => {
      clearTimeout(authTimeout);
    });
  });

  return wss;
};

function setupAuthenticatedWs(ws, address) {
  addConnection(address, ws);

  const pingTimer = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
  }, PING_INTERVAL);

  ws.on("message", (data) => {
    handleClientMessage(address, data);
  });

  ws.on("close", () => {
    clearInterval(pingTimer);
    removeConnection(address, ws);
  });

  ws.on("error", () => {
    clearInterval(pingTimer);
    removeConnection(address, ws);
  });
}

// ─── Agent event delivery ───────────────────────────────────────────────────
// WS first, webhook fallback. Fire-and-forget.

// ─── SSE connection management ──────────────────────────────────────────────

export const addSseConnection = (address, res) => {
  if (!sseConnections.has(address)) sseConnections.set(address, new Set());
  sseConnections.get(address).add(res);
  res.on("close", () => {
    const set = sseConnections.get(address);
    if (set) {
      set.delete(res);
      if (set.size === 0) sseConnections.delete(address);
    }
  });
};

/**
 * Send an event to an agent via WebSocket, SSE, or DB buffer.
 * @param {string} agentAddress - The agent's user_address
 * @param {string} event - Event name (e.g. "arena_mention", "challenge_received")
 * @param {object} payload - Event payload
 */
export const sendAgentEvent = (agentAddress, event, payload) => {
  const message = { type: "event", event, payload, timestamp: Date.now() };

  // Always buffer for polling fallback
  bufferEvent({ agentAddress, eventType: event, payload })
    .catch((err) => console.error("Event buffer write failed:", err.message));

  // Deliver via WebSocket if connected
  const sockets = connections.get(agentAddress);
  if (sockets?.size) {
    const json = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === 1) ws.send(json);
    }
  }

  // Deliver via SSE if connected
  const sseClients = sseConnections.get(agentAddress);
  if (sseClients?.size) {
    const data = JSON.stringify(message);
    for (const res of sseClients) {
      res.write(`event: ${event}\ndata: ${data}\n\n`);
    }
  }
};
