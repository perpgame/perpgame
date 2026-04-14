import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let user
let agent // { agentId, apiKey, agentAddress }

beforeAll(async () => {
  await ensureDb()
  user = await createTestUser()
  agent = await createTestAgent(user.address, "TradingBot")
})

describe("Agent key auth", () => {
  it("returns 401 without key", async () => {
    const res = await request(app).get("/api/trading")
    expect(res.status).toBe(401)
  })

  it("returns 401 with invalid key", async () => {
    const res = await request(app)
      .get("/api/trading")
      .set("X-Agent-Key", "pgk_invalid")
    expect(res.status).toBe(401)
  })
})

describe("GET /api/market-data", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/market-data")
    expect(res.status).toBe(401)
  })

  it("returns market data with auth", async () => {
    const res = await request(app).get("/api/market-data").set("X-Agent-Key", agent.apiKey)
    // 200 from HL, 502 if HL unreachable, 503 if cache not yet populated
    expect([200, 502, 503]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty("coins")
      expect(res.body).toHaveProperty("updatedAt")
      const coins = res.body.coins
      const firstCoin = Object.values(coins)[0]
      if (firstCoin) {
        expect(firstCoin).toHaveProperty("price")
        expect(firstCoin).toHaveProperty("change24h")
        expect(firstCoin).toHaveProperty("fundingRate")
        expect(firstCoin).toHaveProperty("fundingAnnualized")
        expect(firstCoin).toHaveProperty("openInterest")
        expect(firstCoin).toHaveProperty("volume24h")
      }
    }
  })
})

describe("GET /api/market-data/candles", () => {
  it("returns candles for a coin", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=BTC&interval=1h&limit=10").set("X-Agent-Key", agent.apiKey)
    expect([200, 502]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty("coin", "BTC")
      expect(res.body).toHaveProperty("interval", "1h")
      expect(Array.isArray(res.body.candles)).toBe(true)
      if (res.body.candles.length > 0) {
        const c = res.body.candles[0]
        expect(c).toHaveProperty("time")
        expect(c).toHaveProperty("open")
        expect(c).toHaveProperty("high")
        expect(c).toHaveProperty("low")
        expect(c).toHaveProperty("close")
        expect(c).toHaveProperty("volume")
      }
    }
  })

  it("rejects missing coin", async () => {
    const res = await request(app).get("/api/market-data/candles?interval=1h").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
  })

  it("rejects invalid interval", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=BTC&interval=2h").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
  })

  it("requires auth", async () => {
    const res = await request(app).get("/api/market-data/candles?coin=ETH&interval=1h")
    expect(res.status).toBe(401)
  })
})

describe("GET /api/market-data/indicators", () => {
  it("returns indicators for a coin", async () => {
    const res = await request(app).get("/api/market-data/indicators?coin=BTC").set("X-Agent-Key", agent.apiKey)
    expect([200, 400, 502]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty("coin", "BTC")
      expect(res.body).toHaveProperty("price")
      expect(res.body).toHaveProperty("updatedAt")

      // Moving averages
      expect(res.body).toHaveProperty("movingAverages")
      expect(res.body.movingAverages).toHaveProperty("sma20")
      expect(res.body.movingAverages).toHaveProperty("sma50")
      expect(res.body.movingAverages).toHaveProperty("ema12")
      expect(res.body.movingAverages).toHaveProperty("ema26")

      // RSI
      expect(res.body).toHaveProperty("rsi")
      if (res.body.rsi !== null) {
        expect(res.body.rsi).toBeGreaterThanOrEqual(0)
        expect(res.body.rsi).toBeLessThanOrEqual(100)
      }

      // MACD
      expect(res.body).toHaveProperty("macd")
      if (res.body.macd) {
        expect(res.body.macd).toHaveProperty("macdLine")
        expect(res.body.macd).toHaveProperty("ema12")
        expect(res.body.macd).toHaveProperty("ema26")
      }

      // Bollinger Bands
      expect(res.body).toHaveProperty("bollingerBands")
      if (res.body.bollingerBands) {
        expect(res.body.bollingerBands).toHaveProperty("upper")
        expect(res.body.bollingerBands).toHaveProperty("middle")
        expect(res.body.bollingerBands).toHaveProperty("lower")
        expect(res.body.bollingerBands).toHaveProperty("width")
        expect(res.body.bollingerBands.upper).toBeGreaterThan(res.body.bollingerBands.lower)
      }

      // ATR
      expect(res.body).toHaveProperty("atr")

      // Signals summary
      expect(res.body).toHaveProperty("signals")
      expect(["bullish", "bearish", "unknown"]).toContain(res.body.signals.trend)
      expect(["overbought", "oversold", "neutral", "unknown"]).toContain(res.body.signals.momentum)
      expect(["high", "low", "normal", "unknown"]).toContain(res.body.signals.volatility)
    }
  })

  it("rejects missing coin", async () => {
    const res = await request(app).get("/api/market-data/indicators").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
  })

  it("rejects invalid coin format", async () => {
    const res = await request(app).get("/api/market-data/indicators?coin=not-valid").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
  })

  it("requires auth", async () => {
    const res = await request(app).get("/api/market-data/indicators?coin=ETH")
    expect(res.status).toBe(401)
  })
})

describe("GET /api/trading", () => {
  it("returns balance, positions, and open orders", async () => {
    const res = await request(app)
      .get("/api/trading")
      .set("X-Agent-Key", agent.apiKey)

    // 200 from HL or 502 if HL unreachable — both valid
    expect([200, 502]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body).toHaveProperty("balance")
      expect(res.body).toHaveProperty("positions")
      expect(res.body).toHaveProperty("openOrders")
      expect(res.body.balance).toHaveProperty("accountValue")
      expect(res.body.balance).toHaveProperty("withdrawable")
      expect(Array.isArray(res.body.positions)).toBe(true)
      expect(Array.isArray(res.body.openOrders)).toBe(true)
    }
  })
})
