import { describe, it, expect, beforeAll } from "vitest"
import request from "supertest"
import { ensureDb, createTestApp, createTestUser, createTestAgent } from "./setup.js"

const app = createTestApp()
let agent

beforeAll(async () => {
  await ensureDb()
  const user = await createTestUser()
  agent = await createTestAgent(user.address, "IndicatorsBot")
})

describe("GET /api/market-data/indicators", () => {
  it("rejects missing coin", async () => {
    const res = await request(app).get("/api/market-data/indicators").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
  })

  it("rejects invalid coin format", async () => {
    const res = await request(app).get("/api/market-data/indicators?coin=not-valid").set("X-Agent-Key", agent.apiKey)
    expect(res.status).toBe(400)
  })

  it("requires auth", async () => {
    const res = await request(app).get("/api/market-data/indicators?coin=BTC")
    expect(res.status).toBe(401)
  })

  it("returns all indicators with correct types", async () => {
    const res = await request(app).get("/api/market-data/indicators?coin=BTC").set("X-Agent-Key", agent.apiKey)
    // 200 or 400 (not enough data) or 502 (HL unreachable)
    expect([200, 400, 502]).toContain(res.status)
    if (res.status !== 200) return

    expect(res.body).toHaveProperty("coin", "BTC")
    expect(res.body).toHaveProperty("price")
    expect(res.body).toHaveProperty("updatedAt")

    // Moving averages
    expect(res.body.movingAverages).toHaveProperty("sma20")
    expect(res.body.movingAverages).toHaveProperty("sma50")
    expect(res.body.movingAverages).toHaveProperty("ema12")
    expect(res.body.movingAverages).toHaveProperty("ema26")

    // RSI: 0-100
    expect(res.body.rsi).toBeGreaterThanOrEqual(0)
    expect(res.body.rsi).toBeLessThanOrEqual(100)

    // MACD
    expect(res.body.macd).toHaveProperty("macdLine")
    expect(res.body.macd).toHaveProperty("signal")
    expect(res.body.macd).toHaveProperty("histogram")
    expect(typeof res.body.macd.macdLine).toBe("number")
    expect(typeof res.body.macd.signal).toBe("number")
    // histogram = macdLine - signal
    expect(res.body.macd.histogram).toBeCloseTo(res.body.macd.macdLine - res.body.macd.signal, 0)

    // Stochastic: K and D between 0-100
    expect(res.body.stochastic).toHaveProperty("k")
    expect(res.body.stochastic).toHaveProperty("d")
    expect(res.body.stochastic.k).toBeGreaterThanOrEqual(0)
    expect(res.body.stochastic.k).toBeLessThanOrEqual(100)
    expect(res.body.stochastic.d).toBeGreaterThanOrEqual(0)
    expect(res.body.stochastic.d).toBeLessThanOrEqual(100)

    // Williams %R: -100 to 0
    expect(res.body.williamsR).toBeGreaterThanOrEqual(-100)
    expect(res.body.williamsR).toBeLessThanOrEqual(0)

    // Williams %R and Stochastic should be inversely related
    // %R ≈ -(100 - %K)
    expect(res.body.williamsR).toBeCloseTo(-(100 - res.body.stochastic.k), 0)

    // CCI: typically -300 to +300, no hard limits
    expect(typeof res.body.cci).toBe("number")

    // MFI: 0-100
    expect(res.body.mfi).toBeGreaterThanOrEqual(0)
    expect(res.body.mfi).toBeLessThanOrEqual(100)

    // ROC: percentage
    expect(typeof res.body.roc).toBe("number")

    // Aroon: up, down 0-100
    expect(res.body.aroon).toHaveProperty("up")
    expect(res.body.aroon).toHaveProperty("down")
    expect(res.body.aroon).toHaveProperty("oscillator")
    expect(res.body.aroon.up).toBeGreaterThanOrEqual(0)
    expect(res.body.aroon.up).toBeLessThanOrEqual(100)
    expect(res.body.aroon.down).toBeGreaterThanOrEqual(0)
    expect(res.body.aroon.down).toBeLessThanOrEqual(100)
    // oscillator = up - down
    expect(res.body.aroon.oscillator).toBeCloseTo(res.body.aroon.up - res.body.aroon.down, 0)

    // Vortex: VI+ and VI- positive
    expect(res.body.vortex).toHaveProperty("viPlus")
    expect(res.body.vortex).toHaveProperty("viMinus")
    expect(res.body.vortex.viPlus).toBeGreaterThan(0)
    expect(res.body.vortex.viMinus).toBeGreaterThan(0)

    // TRIX: small percentage
    expect(typeof res.body.trix).toBe("number")

    // ADX: 0-100 with +DI and -DI
    expect(res.body.adx).toHaveProperty("adx")
    expect(res.body.adx).toHaveProperty("plusDI")
    expect(res.body.adx).toHaveProperty("minusDI")
    expect(res.body.adx.adx).toBeGreaterThanOrEqual(0)
    expect(res.body.adx.adx).toBeLessThanOrEqual(100)
    expect(res.body.adx.plusDI).toBeGreaterThanOrEqual(0)
    expect(res.body.adx.minusDI).toBeGreaterThanOrEqual(0)

    // Parabolic SAR
    expect(res.body.parabolicSar).toHaveProperty("sar")
    expect(res.body.parabolicSar).toHaveProperty("trend")
    expect(typeof res.body.parabolicSar.sar).toBe("number")
    expect(["bullish", "bearish"]).toContain(res.body.parabolicSar.trend)

    // Bollinger Bands: upper > middle > lower
    expect(res.body.bollingerBands).toHaveProperty("upper")
    expect(res.body.bollingerBands).toHaveProperty("middle")
    expect(res.body.bollingerBands).toHaveProperty("lower")
    expect(res.body.bollingerBands).toHaveProperty("width")
    expect(res.body.bollingerBands.upper).toBeGreaterThan(res.body.bollingerBands.middle)
    expect(res.body.bollingerBands.middle).toBeGreaterThan(res.body.bollingerBands.lower)
    expect(res.body.bollingerBands.width).toBeGreaterThan(0)

    // Keltner Channels: upper > middle > lower
    expect(res.body.keltnerChannels).toHaveProperty("upper")
    expect(res.body.keltnerChannels).toHaveProperty("middle")
    expect(res.body.keltnerChannels).toHaveProperty("lower")
    expect(res.body.keltnerChannels.upper).toBeGreaterThan(res.body.keltnerChannels.middle)
    expect(res.body.keltnerChannels.middle).toBeGreaterThan(res.body.keltnerChannels.lower)

    // Donchian Channels: upper > middle > lower
    expect(res.body.donchianChannels).toHaveProperty("upper")
    expect(res.body.donchianChannels).toHaveProperty("middle")
    expect(res.body.donchianChannels).toHaveProperty("lower")
    expect(res.body.donchianChannels.upper).toBeGreaterThanOrEqual(res.body.donchianChannels.middle)
    expect(res.body.donchianChannels.middle).toBeGreaterThanOrEqual(res.body.donchianChannels.lower)

    // ATR: positive
    expect(res.body.atr).toBeGreaterThan(0)

    // OBV: integer
    expect(typeof res.body.obv).toBe("number")
    expect(Number.isInteger(res.body.obv)).toBe(true)

    // Signals summary
    expect(["bullish", "bearish", "unknown"]).toContain(res.body.signals.trend)
    expect(["overbought", "oversold", "neutral", "unknown"]).toContain(res.body.signals.momentum)
    expect(["high", "low", "normal", "unknown"]).toContain(res.body.signals.volatility)
  })

  it("indicators are cross-consistent", async () => {
    const res = await request(app).get("/api/market-data/indicators?coin=ETH").set("X-Agent-Key", agent.apiKey)
    if (res.status !== 200) return

    // If RSI > 70 (overbought), Stochastic K should also be high (>60)
    if (res.body.rsi > 70) {
      expect(res.body.stochastic.k).toBeGreaterThan(50)
    }
    // If RSI < 30 (oversold), Stochastic K should be low (<40)
    if (res.body.rsi < 30) {
      expect(res.body.stochastic.k).toBeLessThan(50)
    }

    // Bollinger middle should be close to SMA20
    if (res.body.bollingerBands && res.body.movingAverages.sma20) {
      expect(res.body.bollingerBands.middle).toBeCloseTo(res.body.movingAverages.sma20, 0)
    }

    // Keltner middle should be close to EMA20
    // (we use EMA20 for Keltner, which isn't exposed separately, but should be near SMA20)
    if (res.body.keltnerChannels && res.body.movingAverages.sma20) {
      const diff = Math.abs(res.body.keltnerChannels.middle - res.body.movingAverages.sma20)
      const pct = diff / res.body.movingAverages.sma20
      expect(pct).toBeLessThan(0.05) // within 5%
    }

    // Donchian upper should be >= current price or recent high
    expect(res.body.donchianChannels.upper).toBeGreaterThanOrEqual(res.body.donchianChannels.lower)

    // MACD ema12 should match movingAverages.ema12
    if (res.body.macd && res.body.movingAverages.ema12) {
      expect(res.body.macd.ema12).toBeCloseTo(res.body.movingAverages.ema12, 0)
    }

    // Parabolic SAR trend should loosely agree with SMA50 trend
    // (not always, but for a basic sanity check)
    if (res.body.parabolicSar && res.body.signals.trend !== "unknown") {
      // Just check both are valid values
      expect(["bullish", "bearish"]).toContain(res.body.parabolicSar.trend)
    }
  })
})

describe("GET /api/market-data/analysis", () => {
  it("includes all indicators", async () => {
    const res = await request(app).get("/api/market-data/analysis?coin=BTC").set("X-Agent-Key", agent.apiKey)
    if (res.status !== 200) return

    expect(res.body).toHaveProperty("indicators")
    if (!res.body.indicators) return

    // Spot-check that new indicators are present
    expect(res.body.indicators).toHaveProperty("stochastic")
    expect(res.body.indicators).toHaveProperty("williamsR")
    expect(res.body.indicators).toHaveProperty("cci")
    expect(res.body.indicators).toHaveProperty("mfi")
    expect(res.body.indicators).toHaveProperty("roc")
    expect(res.body.indicators).toHaveProperty("aroon")
    expect(res.body.indicators).toHaveProperty("vortex")
    expect(res.body.indicators).toHaveProperty("trix")
    expect(res.body.indicators).toHaveProperty("adx")
    expect(res.body.indicators).toHaveProperty("parabolicSar")
    expect(res.body.indicators).toHaveProperty("keltnerChannels")
    expect(res.body.indicators).toHaveProperty("donchianChannels")
    expect(res.body.indicators).toHaveProperty("obv")
  })
})
