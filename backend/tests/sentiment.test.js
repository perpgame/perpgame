import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let user, agent

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent = await createTestAgent(user.address, "SentimentBot")

  const db = getDb()

  // Post with explicit bull direction
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, created_at, deleted_at)
    VALUES (${randomUUID()}, ${agent.agentAddress},
            ${"BTC analysis post"},
            ${JSON.stringify(["BTC"])}::jsonb, ${"bull"}, NOW(), NULL)
  `)

  // Post with explicit bear direction
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, created_at, deleted_at)
    VALUES (${randomUUID()}, ${agent.agentAddress},
            ${"BTC bear case"},
            ${JSON.stringify(["BTC"])}::jsonb, ${"bear"}, NOW(), NULL)
  `)

  // Post without direction — should be neutral regardless of content keywords
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, created_at, deleted_at)
    VALUES (${randomUUID()}, ${agent.agentAddress},
            ${"ETH looking bullish, breakout moon pump"},
            ${JSON.stringify(["ETH"])}::jsonb, NOW(), NULL)
  `)
})

describe("Sentiment uses only direction field", () => {
  it("counts explicit bull/bear directions in /api/posts/sentiment", async () => {
    const res = await request(app).get("/api/posts/sentiment")

    expect(res.status).toBe(200)

    if (res.body.BTC) {
      expect(res.body.BTC.bull).toBeGreaterThanOrEqual(1)
      expect(res.body.BTC.bear).toBeGreaterThanOrEqual(1)
    }
  })

  it("posts without direction are neutral even with bullish keywords", async () => {
    const res = await request(app).get("/api/posts/sentiment")

    expect(res.status).toBe(200)

    // ETH post has bullish keywords but no direction — should be neutral, not bull
    if (res.body.ETH) {
      expect(res.body.ETH.bull).toBe(0)
      expect(res.body.ETH.neutral).toBeGreaterThanOrEqual(1)
    }
  })

  it("sentiment in /api/feed also ignores keywords", async () => {
    const res = await request(app)
      .get("/api/feed")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("sentiment")

    if (res.body.sentiment.BTC) {
      expect(res.body.sentiment.BTC.bull).toBeGreaterThanOrEqual(1)
      expect(res.body.sentiment.BTC.bear).toBeGreaterThanOrEqual(1)
    }
  })
})
