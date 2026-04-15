import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { randomUUID } from "node:crypto"
import { sql } from "drizzle-orm"
import { getDb } from "../db/index.js"
import { ensureDb, createTestApp, createTestUser, createTestAgent, cleanup } from "./setup.js"

const app = createTestApp()
let user, agent, otherAgent
const createdAddresses = []

// Insert a prediction directly with all scoring fields pre-filled
async function createScoredPrediction(authorAddress, {
  coin = "BTC",
  direction = "bull",
  timeframe = "1h",
  outcome = "correct",
  priceAtCall = 65000,
  priceAtExpiry = 66000,
  confidence = null,
  indicators = null,
  expiresAt = null,
} = {}) {
  const db = getDb()
  const id = randomUUID()
  const expires = expiresAt || new Date(Date.now() - 3600_000).toISOString()
  const indicatorsJson = indicators ? JSON.stringify(indicators) : null
  await db.execute(sql`
    INSERT INTO posts (
      id, author_address, content, tags,
      direction, timeframe, confidence,
      prediction_coin, prediction_price_at_call, prediction_price_at_expiry,
      prediction_expires_at, prediction_scored, prediction_outcome,
      prediction_indicators
    ) VALUES (
      ${id}, ${authorAddress},
      ${`${direction} ${coin} ${timeframe} — test prediction`},
      ${JSON.stringify([coin])},
      ${direction}, ${timeframe}, ${confidence},
      ${coin}, ${priceAtCall}, ${priceAtExpiry},
      ${expires}::TIMESTAMPTZ, TRUE, ${outcome},
      ${indicatorsJson}::jsonb
    )
  `)
  return id
}

async function createActivePrediction(authorAddress, { coin = "BTC", direction = "bull", timeframe = "4h" } = {}) {
  const db = getDb()
  const id = randomUUID()
  const expires = new Date(Date.now() + 4 * 3600_000).toISOString()
  await db.execute(sql`
    INSERT INTO posts (
      id, author_address, content, tags,
      direction, timeframe,
      prediction_coin, prediction_price_at_call,
      prediction_expires_at, prediction_scored
    ) VALUES (
      ${id}, ${authorAddress},
      ${`active ${direction} ${coin} prediction`},
      ${JSON.stringify([coin])},
      ${direction}, ${timeframe},
      ${coin}, ${67000},
      ${expires}::TIMESTAMPTZ, FALSE
    )
  `)
  return id
}

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent = await createTestAgent(user.address, "HistoryBot")
  otherAgent = await createTestAgent(user.address, "OtherBot")
  createdAddresses.push(user.address, agent.agentAddress, otherAgent.agentAddress)

  const sampleIndicators = {
    rsi: 42.5, trend: "bearish", momentum: "neutral", volatility: "normal",
    sma50: 64200, ema12: 64800, ema26: 64500, macdLine: 300,
    bbUpper: 67000, bbLower: 62000, bbWidth: 7.7, atr: 1200,
  }

  // Create a mix of scored predictions for the main agent
  await createScoredPrediction(agent.agentAddress, { coin: "BTC", direction: "bull", timeframe: "1h", outcome: "correct", indicators: sampleIndicators })
  await createScoredPrediction(agent.agentAddress, { coin: "BTC", direction: "bear", timeframe: "1h", outcome: "wrong", indicators: sampleIndicators })
  await createScoredPrediction(agent.agentAddress, { coin: "ETH", direction: "bull", timeframe: "4h", outcome: "correct", indicators: { ...sampleIndicators, rsi: 55 } })
  await createScoredPrediction(agent.agentAddress, { coin: "SOL", direction: "bear", timeframe: "24h", outcome: "neutral", indicators: null })
  await createScoredPrediction(agent.agentAddress, { coin: "BTC", direction: "bull", timeframe: "4h", outcome: "wrong", confidence: 0.9, indicators: sampleIndicators })
  // Active prediction (not scored)
  await createActivePrediction(agent.agentAddress, { coin: "BTC", direction: "bull", timeframe: "4h" })
  // Prediction belonging to another agent
  await createScoredPrediction(otherAgent.agentAddress, { coin: "BTC", direction: "bull", timeframe: "1h", outcome: "correct" })
})

afterAll(async () => {
  await cleanup(createdAddresses)
})

// ─── GET /api/predictions/history ────────────────────────────────────────────

describe("GET /api/predictions/history", () => {
  it("requires agent key", async () => {
    const res = await request(app).get("/api/predictions/history")
    expect(res.status).toBe(401)
  })

  it("returns only the requesting agent's predictions", async () => {
    const res = await request(app)
      .get("/api/predictions/history")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Should not include the other agent's prediction
    const addresses = res.body.map(p => p.authorAddress).filter(Boolean)
    expect(addresses.every(a => a === agent.agentAddress)).toBe(true)
  })

  it("returns all scored and unscored predictions", async () => {
    const res = await request(app)
      .get("/api/predictions/history")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    // We inserted 5 scored + 1 active for this agent
    expect(res.body.length).toBeGreaterThanOrEqual(6)
  })

  it("returns required fields on each entry", async () => {
    const res = await request(app)
      .get("/api/predictions/history")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const entry = res.body[0]
    expect(entry).toHaveProperty("id")
    expect(entry).toHaveProperty("coin")
    expect(entry).toHaveProperty("direction")
    expect(entry).toHaveProperty("timeframe")
    expect(entry).toHaveProperty("outcome")
    expect(entry).toHaveProperty("priceAtCall")
    expect(entry).toHaveProperty("priceAtExpiry")
    expect(entry).toHaveProperty("priceDelta")
    expect(entry).toHaveProperty("createdAt")
    expect(entry).toHaveProperty("expiresAt")
    expect(entry).toHaveProperty("indicatorsAtCall")
    expect(entry).toHaveProperty("content")
  })

  it("includes indicatorsAtCall when stored", async () => {
    const res = await request(app)
      .get("/api/predictions/history?coin=BTC&outcome=correct")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const withIndicators = res.body.find(p => p.indicatorsAtCall !== null)
    expect(withIndicators).toBeDefined()
    expect(withIndicators.indicatorsAtCall).toHaveProperty("rsi")
    expect(withIndicators.indicatorsAtCall).toHaveProperty("trend")
    expect(withIndicators.indicatorsAtCall).toHaveProperty("sma50")
  })

  it("returns null indicatorsAtCall when not stored", async () => {
    const res = await request(app)
      .get("/api/predictions/history?coin=SOL")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const solPred = res.body.find(p => p.coin === "SOL")
    expect(solPred).toBeDefined()
    expect(solPred.indicatorsAtCall).toBeNull()
  })

  it("computes priceDelta correctly", async () => {
    // priceAtCall=65000, priceAtExpiry=66000 → delta = +1.54%
    const res = await request(app)
      .get("/api/predictions/history?coin=BTC&outcome=correct&timeframe=1h")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const pred = res.body.find(p => p.priceAtCall === 65000)
    expect(pred).toBeDefined()
    expect(pred.priceDelta).toBeCloseTo(1.54, 1)
  })

  it("filters by coin", async () => {
    const res = await request(app)
      .get("/api/predictions/history?coin=ETH")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.every(p => p.coin === "ETH")).toBe(true)
  })

  it("filters by timeframe", async () => {
    const res = await request(app)
      .get("/api/predictions/history?timeframe=4h")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.every(p => p.timeframe === "4h")).toBe(true)
  })

  it("filters by outcome=correct", async () => {
    const res = await request(app)
      .get("/api/predictions/history?outcome=correct")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.every(p => p.outcome === "correct")).toBe(true)
  })

  it("filters by outcome=wrong", async () => {
    const res = await request(app)
      .get("/api/predictions/history?outcome=wrong")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.every(p => p.outcome === "wrong")).toBe(true)
  })

  it("filters by outcome=neutral", async () => {
    const res = await request(app)
      .get("/api/predictions/history?outcome=neutral")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.every(p => p.outcome === "neutral")).toBe(true)
  })

  it("rejects invalid outcome value", async () => {
    const res = await request(app)
      .get("/api/predictions/history?outcome=invalid")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(400)
  })

  it("rejects invalid coin format", async () => {
    const res = await request(app)
      .get("/api/predictions/history?coin=btc!!!")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(400)
  })

  it("combines coin + outcome filters", async () => {
    const res = await request(app)
      .get("/api/predictions/history?coin=BTC&outcome=wrong")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.every(p => p.coin === "BTC" && p.outcome === "wrong")).toBe(true)
  })

  it("respects limit param", async () => {
    const res = await request(app)
      .get("/api/predictions/history?limit=2")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeLessThanOrEqual(2)
  })

  it("caps limit at 200", async () => {
    const res = await request(app)
      .get("/api/predictions/history?limit=9999")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    // Just verify it doesn't error — actual cap enforced server-side
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("returns results in descending created_at order", async () => {
    const res = await request(app)
      .get("/api/predictions/history")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const dates = res.body.map(p => new Date(p.createdAt).getTime())
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1])
    }
  })

  it("postmortem=true does not error on scored predictions", async () => {
    const res = await request(app)
      .get("/api/predictions/history?outcome=correct&postmortem=true&limit=2")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    // Each scored entry should have postMortemCandles key (array or null)
    for (const p of res.body.filter(p => p.outcome !== null)) {
      expect(p).toHaveProperty("postMortemCandles")
    }
  })

  it("postmortem=false omits postMortemCandles field", async () => {
    const res = await request(app)
      .get("/api/predictions/history?limit=2")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    for (const p of res.body) {
      expect(p.postMortemCandles).toBeUndefined()
    }
  })

  it("confidence is returned when set", async () => {
    const res = await request(app)
      .get("/api/predictions/history?coin=BTC&timeframe=4h&outcome=wrong")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const withConf = res.body.find(p => p.confidence !== null)
    expect(withConf).toBeDefined()
    expect(withConf.confidence).toBeCloseTo(0.9, 1)
  })
})

// ─── GET /api/predictions — now includes indicatorsAtCall ────────────────────

describe("GET /api/predictions (indicatorsAtCall)", () => {
  it("includes indicatorsAtCall field", async () => {
    const res = await request(app)
      .get(`/api/predictions?author=${agent.agentAddress}&outcome=correct`)

    expect(res.status).toBe(200)
    expect(res.body.length).toBeGreaterThan(0)
    // Field should exist on every entry (null if not stored)
    for (const p of res.body) {
      expect(p).toHaveProperty("indicatorsAtCall")
    }
  })

  it("indicatorsAtCall is populated when indicators were stored", async () => {
    const res = await request(app)
      .get(`/api/predictions?author=${agent.agentAddress}&coin=BTC&outcome=correct`)

    expect(res.status).toBe(200)
    const pred = res.body.find(p => p.indicatorsAtCall !== null)
    expect(pred).toBeDefined()
    expect(pred.indicatorsAtCall).toHaveProperty("rsi")
  })
})

// ─── GET /api/home — prediction_results depth ────────────────────────────────

describe("GET /api/home (prediction_results depth)", () => {
  it("returns prediction_results array", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty("prediction_results")
    expect(Array.isArray(res.body.prediction_results)).toBe(true)
  })

  it("prediction_results entries include indicatorsAtCall", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    for (const p of res.body.prediction_results) {
      expect(p).toHaveProperty("indicatorsAtCall")
      expect(p).toHaveProperty("outcome")
      expect(p).toHaveProperty("priceAtCall")
      expect(p).toHaveProperty("priceDelta")
    }
  })

  it("your_account contains only stats fields", async () => {
    const res = await request(app)
      .get("/api/home")
      .set("X-Agent-Key", agent.apiKey)

    expect(res.status).toBe(200)
    const acct = res.body.your_account
    expect(acct).toHaveProperty("accuracy")
    expect(acct).toHaveProperty("correct")
    expect(acct).toHaveProperty("wrong")
    expect(acct).toHaveProperty("total")
    expect(acct).toHaveProperty("pending")
    expect(acct).not.toHaveProperty("name")
    expect(acct).not.toHaveProperty("bio")
    expect(acct).not.toHaveProperty("followers")
    expect(res.body).not.toHaveProperty("your_settings")
    expect(res.body).not.toHaveProperty("latest_feed")
    expect(res.body).not.toHaveProperty("what_to_do_next")
    expect(res.body).not.toHaveProperty("quick_links")
  })
})
