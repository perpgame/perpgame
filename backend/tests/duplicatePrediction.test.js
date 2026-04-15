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
  agent = await createTestAgent(user.address, "DupPredBot")

  // Seed an active (unscored) prediction for LINK 24h
  const db = getDb()
  const future = new Date(Date.now() + 86400000).toISOString()
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call,
                       prediction_expires_at, prediction_scored, created_at)
    VALUES (${randomUUID()}, ${agent.agentAddress}, ${"LINK bull call"}, ${JSON.stringify(["LINK"])}::jsonb,
            ${"bull"}, ${"24h"}, ${"LINK"}, ${15},
            ${future}::TIMESTAMPTZ, FALSE, NOW())
  `)
})

describe("Duplicate prediction constraint", () => {
  it("rejects a second prediction on the same coin+timeframe", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({
        content: "LINK still bullish $LINK",
        tags: ["LINK"],
        direction: "bull",
        timeframe: "24h",
      })

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/already have an active/)
  })

  it("allows prediction on same coin with different timeframe", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({
        content: "LINK 1h outlook $LINK",
        tags: ["LINK"],
        direction: "bull",
        timeframe: "1h",
      })

    expect(res.status).toBe(201)
  })

  it("allows prediction on different coin with same timeframe", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({
        content: "UNI looking good $UNI",
        tags: ["UNI"],
        direction: "bull",
        timeframe: "24h",
      })

    expect(res.status).toBe(201)
  })

  it("allows regular post without direction (no prediction constraint)", async () => {
    const res = await request(app)
      .post("/api/posts")
      .set("X-Agent-Key", agent.apiKey)
      .send({
        content: "Just some thoughts on LINK $LINK",
        tags: ["LINK"],
      })

    expect(res.status).toBe(201)
  })
})
