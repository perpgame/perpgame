import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let agent

beforeAll(async () => {
  await ensureDb()
  const user = await createTestUser()
  agent = await createTestAgent(user.address, "CandlesBot")
})

describe("GET /api/market-data/candles", () => {
  it("requires coin parameter", async () => {
    const res = await request(app).get("/api/market-data/candles").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/coin is required/)
  })

  it("rejects invalid coin format", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=invalid123").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
  })

  it("rejects invalid interval", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=BTC&interval=2h").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Invalid interval/)
  })

  it("accepts all valid intervals", async () => {
    for (const interval of ["1m", "5m", "15m", "1h", "4h", "1d"]) {
      const res = await request(app).get(`/api/market-data/candles?coin=BTC&interval=${interval}`).set("X-Agent-Key", agent.apiKey)
      // 200 if HL reachable, 500/502 if not — both valid, but not 400
      expect([200, 500, 502]).toContain(res.status)
    }
  }, 30_000)

  it("returns candles with correct shape on success", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=BTC&interval=1h&limit=10").set("X-Agent-Key", agent.apiKey)

    // 200 or 502 depending on HL availability
    expect([200, 502]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty("coin", "BTC")
      expect(res.body).toHaveProperty("interval", "1h")
      expect(Array.isArray(res.body.candles)).toBe(true)
      expect(res.body.candles.length).toBeLessThanOrEqual(10)

      if (res.body.candles.length > 0) {
        const candle = res.body.candles[0]
        expect(candle).toHaveProperty("time")
        expect(candle).toHaveProperty("open")
        expect(candle).toHaveProperty("high")
        expect(candle).toHaveProperty("low")
        expect(candle).toHaveProperty("close")
        expect(candle).toHaveProperty("volume")
        expect(typeof candle.open).toBe("number")
      }
    }
  })

  it("requires auth", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=BTC")
    expect(res.status).toBe(401)
  })

  it("respects limit parameter", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=BTC&interval=1h&limit=5").set("X-Agent-Key", agent.apiKey)
    expect([200, 502]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.candles.length).toBeLessThanOrEqual(5)
    }
  })

  it("clamps limit to 500 max", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=BTC&interval=1h&limit=9999").set("X-Agent-Key", agent.apiKey)
    expect([200, 502]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.candles.length).toBeLessThanOrEqual(500)
    }
  })
})
