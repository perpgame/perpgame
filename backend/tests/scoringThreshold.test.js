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
  agent = await createTestAgent(user.address, "ThresholdBot")

  const db = getDb()
  const past = new Date(Date.now() - 86400000).toISOString()

  // Prediction scored as "neutral" — price barely moved (< 0.1%)
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome, created_at)
    VALUES (${randomUUID()}, ${agent.agentAddress}, ${"BTC barely moved"}, ${JSON.stringify(["BTC"])}::jsonb,
            ${"bull"}, ${"24h"}, ${"BTC"}, ${65000}, ${65050},
            ${past}::TIMESTAMPTZ, TRUE, ${"neutral"}, ${past}::TIMESTAMPTZ)
  `)

  // Prediction scored as "correct" — price moved enough (> 0.1%)
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome, created_at)
    VALUES (${randomUUID()}, ${agent.agentAddress}, ${"BTC up big"}, ${JSON.stringify(["BTC"])}::jsonb,
            ${"bull"}, ${"24h"}, ${"BTC"}, ${65000}, ${68000},
            ${past}::TIMESTAMPTZ, TRUE, ${"correct"}, ${past}::TIMESTAMPTZ)
  `)

  // Prediction scored as "wrong"
  await db.execute(sql`
    INSERT INTO posts (id, author_address, content, tags, direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
                       prediction_expires_at, prediction_scored, prediction_outcome, created_at)
    VALUES (${randomUUID()}, ${agent.agentAddress}, ${"ETH wrong"}, ${JSON.stringify(["ETH"])}::jsonb,
            ${"bull"}, ${"24h"}, ${"ETH"}, ${3500}, ${3200},
            ${past}::TIMESTAMPTZ, TRUE, ${"wrong"}, ${past}::TIMESTAMPTZ)
  `)
})

describe("Scoring threshold — neutral outcomes", () => {
  it("neutral predictions are excluded from accuracy denominator in /home", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)

    const acc = res.body.your_account
    // 1 correct + 1 wrong = 2 scored non-neutral
    // accuracy = 1/2 = 50%, NOT 1/3 = 33% (which would include neutral)
    expect(acc.correct).toBe(1)
    expect(acc.wrong).toBe(1)
    expect(acc.accuracy).toBe(50)
  })

  it("neutral predictions appear in prediction history", async () => {
    const res = await request(app)
      .get(`/api/predictions?author=${agent.agentAddress}`)

    expect(res.status).toBe(200)

    const neutral = res.body.find(p => p.outcome === "neutral")
    expect(neutral).toBeDefined()
    expect(neutral.coin).toBe("BTC")
  })

  it("accuracy endpoint excludes neutral from rate calculation", async () => {
    const res = await request(app)
      .get(`/api/agents/${agent.agentAddress}/accuracy`)
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)

    // overall: 1 correct, 1 wrong, total scored = 3 (includes neutral)
    // but accuracy should be correct/(correct+wrong) = 1/2 = 50%
    expect(res.body.overall.correct).toBe(1)
    expect(res.body.overall.wrong).toBe(1)
    expect(res.body.overall.accuracy).toBe(50)
  })
})
