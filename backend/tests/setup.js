/**
 * Test setup — uses real auth (JWT tokens) and real DB.
 */
import express from "express"
import cookieParser from "cookie-parser"
import { randomUUID, randomBytes, createHash } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb, connectDb } from "../db/index.js"
import { createToken } from "../auth/jwt.js"

import agentTradingRoutes from "../routes/agentTrading.js"
import agentSocialRoutes from "../routes/agentSocial.js"
import agentLeaderboardRoutes from "../routes/agentLeaderboard.js"
import postRoutes from "../routes/posts.js"
import commentRoutes from "../routes/comments.js"
import likeRoutes from "../routes/likes.js"
import userRoutes from "../routes/users.js"
import { loadMeta, seedMeta } from "../meta.js"

let dbConnected = false

export async function ensureDb() {
  if (!dbConnected) {
    await connectDb()
    // Load real coin meta from HL, then add test-only coins on top
    await loadMeta().catch(() => {})
    // Ensure common test coins are always valid (HL may use different names)
    seedMeta(["BTC", "ETH", "SOL", "DOGE", "ARB", "OP", "AVAX", "MATIC", "LINK", "UNI"])
    dbConnected = true
  }
}

/**
 * Create a test Express app with all agent-related routes mounted.
 */
export function createTestApp() {
  const app = express()
  app.use(express.json({ limit: "512kb" }))
  app.use(cookieParser())

  app.use("/api", agentLeaderboardRoutes)
  app.use("/api", agentTradingRoutes)
  app.use("/api", agentSocialRoutes)
  app.use("/api/posts", postRoutes)
  app.use("/api/posts", commentRoutes)
  app.use("/api/posts", likeRoutes)
  app.use("/api/users", userRoutes)

  return app
}

/**
 * Create a test user in the DB. Returns { address, token }.
 */
export async function createTestUser(address) {
  const addr = (address || `0x${randomBytes(20).toString("hex")}`).toLowerCase()
  const db = getDb()
  await db.execute(sql`
    INSERT INTO users (address, verified, display_name)
    VALUES (${addr}, TRUE, ${"Test User"})
    ON CONFLICT (address) DO NOTHING
  `)
  const token = createToken(addr, true)
  return { address: addr, token }
}

/**
 * Create a test agent directly in DB. Returns { agentId, apiKey, agentAddress }.
 */
export async function createTestAgent(ownerAddress, name = "Test Agent") {
  const db = getDb()
  const agentId = randomUUID()
  const apiKey = `pgk_${randomBytes(32).toString("hex")}`
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex")
  const keyPrefix = apiKey.slice(0, 8)
  // Use a real-looking ETH address (not synthetic 0xagent...)
  const agentAddress = `0x${randomBytes(20).toString("hex")}`.toLowerCase()

  // Create user with real address
  await db.execute(sql`
    INSERT INTO users (address, verified, display_name)
    VALUES (${agentAddress}, TRUE, ${name})
    ON CONFLICT (address) DO NOTHING
  `)

  // Create agent record — address is both owner and user
  await db.execute(sql`
    INSERT INTO agents (id, user_address, api_key_hash, key_prefix, is_public)
    VALUES (${agentId}, ${agentAddress}, ${apiKeyHash}, ${keyPrefix}, TRUE)
  `)

  return { agentId, apiKey, agentAddress, keyPrefix }
}

/**
 * Create a test post by an agent. Returns post id.
 */
export async function createTestPost(authorAddress, content = "Test post $BTC", tags = ["BTC"]) {
  const db = getDb()
  const id = randomUUID()
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags)
    VALUES (${id}, ${authorAddress}, ${content}, ${JSON.stringify(tags)})
  `)
  return id
}

/**
 * Auth header helper.
 */
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` }
}

/**
 * Create a test HTTP server with WebSocket support.
 * Returns { url, httpServer, close }.
 */
export async function createTestServer() {
  const { createServer } = await import("node:http")
  const { attachWsServer } = await import("../lib/wsServer.js")

  const app = createTestApp()
  const server = createServer(app)
  attachWsServer(server)

  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port
      resolve({
        app,
        httpServer: server,
        url: `http://localhost:${port}`,
        wsUrl: `ws://localhost:${port}/ws`,
        close: () => server.close(),
      })
    })
  })
}

/**
 * Clean up test data. Call in afterAll.
 */
export async function cleanup(addresses = []) {
  const db = getDb()
  for (const addr of addresses) {
    await db.execute(sql`DELETE FROM comments WHERE author_address = ${addr}`).catch(() => {})
    await db.execute(sql`DELETE FROM posts WHERE author_address = ${addr}`).catch(() => {})
    await db.execute(sql`DELETE FROM agents WHERE user_address = ${addr}`).catch(() => {})
    await db.execute(sql`DELETE FROM users WHERE address = ${addr}`).catch(() => {})
  }
}
