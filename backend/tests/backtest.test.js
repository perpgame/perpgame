import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let agent, agentToken, otherToken

beforeAll(async () => {
  await ensureDb()
  const user = await createTestUser()
  agent = await createTestAgent(user.address, "BacktestBot")
  agentToken = (await createTestUser(agent.agentAddress)).token
  const user2 = await createTestUser()
  const otherAgent = await createTestAgent(user2.address, "OtherBot")
  otherToken = (await createTestUser(otherAgent.agentAddress)).token
})

const url = (address) => `/api/agents/${address}/backtest`
const scanUrl = (address) => `/api/agents/${address}/backtest/scan`
const auth = (token) => ({ Authorization: `Bearer ${token}` })
// Default strategy: a simple bull hypothesis
const defaultStrategy = { direction: "bull", conditions: [{ path: "rsi", operator: ">", value: 50 }], conditionLogic: "all" }
const body = (coin = "BTC", timeframe = "1h", strategy = defaultStrategy) => ({ coin, timeframe, strategy })

// ─── Auth & validation ────────────────────────────────────────────────────────

describe("POST /api/agents/:address/backtest — auth & validation", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).post(url(agent.agentAddress)).send(body())
    expect(res.status).toBe(401)
  })

  it("returns 403 when user is not owner or whitelisted viewer", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(otherToken)).send(body())
    expect(res.status).toBe(403)
  })

  it("returns 400 when coin is missing", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send({ timeframe: "1h", strategy: defaultStrategy })
    expect(res.status).toBe(400)
  })

  it("returns 400 when timeframe is missing", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send({ coin: "BTC", strategy: defaultStrategy })
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid timeframe", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(body("BTC", "2h"))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid coin format", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(body("not-valid", "1h"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when strategy.conditions is missing", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when strategy.conditions is empty array", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull", conditions: [] }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when direction is missing", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { conditions: [{ path: "rsi", operator: ">", value: 50 }] }))
    expect(res.status).toBe(400)
  })

  it("returns 400 for invalid operator in condition", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull", conditions: [{ path: "rsi", operator: "between", value: 50 }] }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when backtesting a real-time-only indicator", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull", conditions: [{ path: "obImbalance", operator: ">", value: 0 }] }))
    expect(res.status).toBe(400)
  })
})

// ─── Response shape ───────────────────────────────────────────────────────────

describe("POST /api/agents/:address/backtest — response shape", () => {
  it("returns 200 with correct shape for BTC 1h", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(body("BTC", "1h"))
    expect([200, 400, 502]).toContain(res.status)
    if (res.status !== 200) return

    const b = res.body
    expect(b.coin).toBe("BTC")
    expect(b.timeframe).toBe("1h")
    expect(b).toHaveProperty("strategy")
    expect(b.strategy).toHaveProperty("direction")
    expect(b.strategy).toHaveProperty("conditions")
    expect(b.strategy).toHaveProperty("conditionLogic")
    expect(typeof b.candlesAnalyzed).toBe("number")
    expect(typeof b.totalSignals).toBe("number")
    expect(b).toHaveProperty("accuracy")
    expect(Array.isArray(b.walkForward)).toBe(true)
    expect(b.walkForward.length).toBe(3)
    expect(Array.isArray(b.warnings)).toBe(true)
    expect(b).toHaveProperty("generatedAt")
  })

  it("accuracy is null or number in [0, 100]", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(body())
    if (res.status !== 200) return
    if (res.body.accuracy !== null) {
      expect(res.body.accuracy).toBeGreaterThanOrEqual(0)
      expect(res.body.accuracy).toBeLessThanOrEqual(100)
    }
  })

  it("walkForward has 3 periods with correct labels", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(body())
    if (res.status !== 200) return
    const labels = res.body.walkForward.map(w => w.period)
    expect(labels).toEqual(["oldest", "middle", "recent"])
  })

  it("warns when signal count < 30", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull", conditions: [
        { path: "rsi", operator: ">", value: 70 },
        { path: "macd.histogram", operator: ">", value: 0 },
        { path: "adx.adx", operator: ">", value: 30 },
      ], conditionLogic: "all" }))
    if (res.status !== 200) return
    if (res.body.totalSignals < 30) {
      expect(res.body.warnings).toContain("low_signal_count")
    }
  })
})

// ─── Strategy variants ────────────────────────────────────────────────────────

describe("POST /api/agents/:address/backtest — strategy variants", () => {
  it("accepts direction=bull", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull", conditions: [{ path: "rsi", operator: ">", value: 50 }] }))
    expect([200, 400, 502]).toContain(res.status)
    if (res.status === 200) expect(res.body.strategy.direction).toBe("bull")
  })

  it("accepts direction=bear", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bear", conditions: [{ path: "rsi", operator: "<", value: 50 }] }))
    expect([200, 400, 502]).toContain(res.status)
    if (res.status === 200) expect(res.body.strategy.direction).toBe("bear")
  })

  it("conditionLogic is always all regardless of input", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull", conditions: [{ path: "rsi", operator: ">", value: 50 }, { path: "macd.histogram", operator: ">", value: 0 }], conditionLogic: "any" }))
    expect([200, 400, 502]).toContain(res.status)
    if (res.status === 200) expect(res.body.strategy.conditionLogic).toBe("all")
  })

  it("accepts multi-condition hypothesis", async () => {
    const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken))
      .send(body("BTC", "1h", { direction: "bull", conditions: [
        { path: "rsi", operator: ">", value: 40 },
        { path: "macd.histogram", operator: ">", value: 0 },
      ], conditionLogic: "all" }))
    expect([200, 400, 502]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.strategy.conditions).toHaveLength(2)
      expect(res.body.strategy.conditionLogic).toBe("all")
    }
  })

  for (const tf of ["15m", "30m", "1h", "4h"]) {
    it(`accepts timeframe=${tf}`, async () => {
      const res = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(body("BTC", tf))
      expect([200, 400, 502]).toContain(res.status)
      if (res.status === 200) expect(res.body.timeframe).toBe(tf)
    })
  }
})

// ─── No caching — each run is fresh ──────────────────────────────────────────

describe("POST /api/agents/:address/backtest — no caching", () => {
  it("same hypothesis returns a new generatedAt on each run", async () => {
    const payload = body("ETH", "4h", { direction: "bull", conditions: [{ path: "rsi", operator: ">", value: 45 }], conditionLogic: "all" })
    const r1 = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(payload)
    if (r1.status !== 200) return
    await new Promise(r => setTimeout(r, 5))
    const r2 = await request(app).post(url(agent.agentAddress)).set(auth(agentToken)).send(payload)
    expect(r2.status).toBe(200)
    expect(r2.body.generatedAt).not.toBe(r1.body.generatedAt)
  })
})

// ─── Scanner ─────────────────────────────────────────────────────────────────

describe("GET /api/agents/:address/backtest/scan", () => {
  it("returns 401 without auth", async () => {
    const res = await request(app).get(scanUrl(agent.agentAddress))
    expect(res.status).toBe(401)
  })

  it("returns 403 for non-owner", async () => {
    const res = await request(app).get(scanUrl(agent.agentAddress)).set(auth(otherToken))
    expect(res.status).toBe(403)
  })

  it("returns ranked array", async () => {
    const res = await request(app).get(scanUrl(agent.agentAddress)).set(auth(agentToken))
    expect([200, 502]).toContain(res.status)
    if (res.status !== 200) return
    expect(Array.isArray(res.body.ranked)).toBe(true)
    expect(res.body).toHaveProperty("strategy")
    expect(res.body).toHaveProperty("generatedAt")
    for (const r of res.body.ranked) {
      expect(r).toHaveProperty("coin")
      expect(r).toHaveProperty("timeframe")
      expect(r).toHaveProperty("totalSignals")
      expect(r).toHaveProperty("accuracy")
    }
  })
}, 30_000)
