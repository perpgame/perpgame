import { describe, it, expect } from "vitest"
import {
  computeEMA, computeSMA, computeRSI, computeMACD,
  computeBollingerBands, computeATR, computeStochastic,
  computeWilliamsR, computeCCI, computeMFI, computeROC,
  computeAroon, computeADX, computeParabolicSAR,
  computeOBV, computeAllIndicators, computeSignalVotes,
} from "../lib/indicatorEngine.js"

// ─── Candle factory helpers ───────────────────────────────────────────────────

/** Flat candles: constant price, volume 1000 */
function flatCandles(n, price = 100) {
  return Array.from({ length: n }, (_, i) => ({
    time: i * 3600000, open: price, high: price + 0.5,
    low: price - 0.5, close: price, volume: 1000,
  }))
}

/** Trending-up candles: each close is prev + step */
function trendingCandles(n, startPrice = 100, step = 1) {
  return Array.from({ length: n }, (_, i) => {
    const c = startPrice + i * step
    return { time: i * 3600000, open: c - step * 0.3, high: c + step * 0.5, low: c - step * 0.5, close: c, volume: 1000 + i * 10 }
  })
}

/** Alternating up/down candles */
function choppyCandles(n, price = 100, swing = 2) {
  return Array.from({ length: n }, (_, i) => {
    const c = i % 2 === 0 ? price + swing : price - swing
    return { time: i * 3600000, open: price, high: c + 1, low: c - 1, close: c, volume: 1000 }
  })
}

// ─── computeEMA ───────────────────────────────────────────────────────────────

describe("computeEMA", () => {
  it("returns null when not enough data", () => {
    expect(computeEMA([1, 2, 3], 5)).toBeNull()
  })

  it("equals SMA for flat series", () => {
    const closes = flatCandles(50).map(c => c.close)
    const ema = computeEMA(closes, 20)
    expect(ema).toBeCloseTo(100, 1)
  })

  it("tracks price uptrend", () => {
    const closes = trendingCandles(60).map(c => c.close)
    const ema12 = computeEMA(closes, 12)
    const ema26 = computeEMA(closes, 26)
    // Faster EMA should be higher in uptrend
    expect(ema12).toBeGreaterThan(ema26)
  })
})

// ─── computeSMA ───────────────────────────────────────────────────────────────

describe("computeSMA", () => {
  it("returns null when not enough data", () => {
    expect(computeSMA([1, 2], 5)).toBeNull()
  })

  it("returns exact average of last N", () => {
    expect(computeSMA([1, 2, 3, 4, 5], 3)).toBeCloseTo(4, 5)
  })

  it("equals price for flat series", () => {
    const closes = flatCandles(30, 200).map(c => c.close)
    expect(computeSMA(closes, 20)).toBeCloseTo(200, 1)
  })
})

// ─── computeRSI ───────────────────────────────────────────────────────────────

describe("computeRSI", () => {
  it("returns null when not enough data", () => {
    expect(computeRSI([1, 2, 3], 14)).toBeNull()
  })

  it("returns 100 for continuously rising prices (no losses)", () => {
    const closes = trendingCandles(30).map(c => c.close)
    expect(computeRSI(closes, 14)).toBe(100)
  })

  it("returns near 50 for choppy prices", () => {
    const closes = choppyCandles(40).map(c => c.close)
    const rsi = computeRSI(closes, 14)
    expect(rsi).toBeGreaterThan(30)
    expect(rsi).toBeLessThan(70)
  })

  it("stays in [0, 100]", () => {
    const closes = trendingCandles(50, 100, -2).map(c => c.close)
    const rsi = computeRSI(closes, 14)
    expect(rsi).toBeGreaterThanOrEqual(0)
    expect(rsi).toBeLessThanOrEqual(100)
  })
})

// ─── computeMACD ─────────────────────────────────────────────────────────────

describe("computeMACD", () => {
  it("returns null when not enough data", () => {
    expect(computeMACD([1, 2, 3])).toBeNull()
  })

  it("histogram equals macdLine - signal", () => {
    const closes = trendingCandles(60).map(c => c.close)
    const m = computeMACD(closes)
    expect(m).not.toBeNull()
    expect(m.histogram).toBeCloseTo(m.macdLine - m.signal, 1)
  })

  it("positive histogram when price accelerates up (EMA12 leads EMA26)", () => {
    // flat then sharp ramp — EMA12 reacts faster, so MACD histogram > 0
    const closes = [
      ...flatCandles(40, 100).map(c => c.close),
      ...trendingCandles(20, 100, 8).map(c => c.close),
    ]
    const m = computeMACD(closes)
    expect(m.histogram).toBeGreaterThan(0)
  })

  it("negative histogram when price accelerates down", () => {
    // flat then sharp drop — EMA12 reacts faster, so MACD histogram < 0
    const closes = [
      ...flatCandles(40, 200).map(c => c.close),
      ...trendingCandles(20, 200, -8).map(c => c.close),
    ]
    const m = computeMACD(closes)
    expect(m.histogram).toBeLessThan(0)
  })
})

// ─── computeBollingerBands ────────────────────────────────────────────────────

describe("computeBollingerBands", () => {
  it("returns null when not enough data", () => {
    expect(computeBollingerBands([1, 2, 3], 20)).toBeNull()
  })

  it("upper > middle > lower", () => {
    const closes = choppyCandles(40).map(c => c.close)
    const bb = computeBollingerBands(closes, 20)
    expect(bb.upper).toBeGreaterThan(bb.middle)
    expect(bb.middle).toBeGreaterThan(bb.lower)
  })

  it("near-zero width for flat series", () => {
    const closes = flatCandles(30).map(c => c.close)
    const bb = computeBollingerBands(closes, 20)
    expect(bb.width).toBeLessThan(0.1)
  })

  it("middle equals SMA20", () => {
    const closes = trendingCandles(40).map(c => c.close)
    const bb = computeBollingerBands(closes, 20)
    const sma = computeSMA(closes, 20)
    expect(bb.middle).toBeCloseTo(sma, 1)
  })
})

// ─── computeATR ───────────────────────────────────────────────────────────────

describe("computeATR", () => {
  it("returns null when not enough data", () => {
    expect(computeATR(flatCandles(5), 14)).toBeNull()
  })

  it("returns positive number", () => {
    const atr = computeATR(trendingCandles(30), 14)
    expect(atr).toBeGreaterThan(0)
  })

  it("higher volatility → higher ATR", () => {
    const calmCandles = Array.from({ length: 30 }, (_, i) => ({
      time: i * 3600000, open: 100, high: 101, low: 99, close: 100, volume: 1000,
    }))
    const volatileCandles = Array.from({ length: 30 }, (_, i) => ({
      time: i * 3600000, open: 100, high: 115, low: 85, close: 100, volume: 1000,
    }))
    expect(computeATR(volatileCandles, 14)).toBeGreaterThan(computeATR(calmCandles, 14))
  })
})

// ─── computeStochastic ────────────────────────────────────────────────────────

describe("computeStochastic", () => {
  it("returns null when not enough data", () => {
    expect(computeStochastic(flatCandles(5), 14, 3)).toBeNull()
  })

  it("K and D in [0, 100]", () => {
    const s = computeStochastic(trendingCandles(30), 14, 3)
    expect(s.k).toBeGreaterThanOrEqual(0)
    expect(s.k).toBeLessThanOrEqual(100)
    expect(s.d).toBeGreaterThanOrEqual(0)
    expect(s.d).toBeLessThanOrEqual(100)
  })

  it("K near 100 in strong uptrend (close near high)", () => {
    const candles = trendingCandles(30, 100, 5)
    const s = computeStochastic(candles, 14, 3)
    expect(s.k).toBeGreaterThan(80)
  })
})

// ─── computeWilliamsR ────────────────────────────────────────────────────────

describe("computeWilliamsR", () => {
  it("returns null when not enough data", () => {
    expect(computeWilliamsR(flatCandles(5), 14)).toBeNull()
  })

  it("stays in [-100, 0]", () => {
    const wr = computeWilliamsR(trendingCandles(30), 14)
    expect(wr).toBeGreaterThanOrEqual(-100)
    expect(wr).toBeLessThanOrEqual(0)
  })

  it("approximately inverse of Stochastic K: wr ≈ -(100 - k)", () => {
    const candles = choppyCandles(40, 100, 5)
    const s = computeStochastic(candles, 14, 3)
    const wr = computeWilliamsR(candles, 14)
    if (s && wr !== null) {
      expect(wr).toBeCloseTo(-(100 - s.k), 0)
    }
  })
})

// ─── computeCCI ───────────────────────────────────────────────────────────────

describe("computeCCI", () => {
  it("returns null when not enough data", () => {
    expect(computeCCI(flatCandles(5), 20)).toBeNull()
  })

  it("returns a number", () => {
    expect(typeof computeCCI(trendingCandles(30), 20)).toBe("number")
  })

  it("returns 0 for flat series (zero mean deviation)", () => {
    // All candles identical → mean deviation is 0, so CCI = 0
    const flat = flatCandles(30, 100)
    expect(computeCCI(flat, 20)).toBe(0)
  })
})

// ─── computeMFI ───────────────────────────────────────────────────────────────

describe("computeMFI", () => {
  it("returns null when not enough data", () => {
    expect(computeMFI(flatCandles(5), 14)).toBeNull()
  })

  it("stays in [0, 100]", () => {
    const mfi = computeMFI(trendingCandles(30), 14)
    expect(mfi).toBeGreaterThanOrEqual(0)
    expect(mfi).toBeLessThanOrEqual(100)
  })

  it("returns 100 when all money flow is positive (no negMF)", () => {
    // Strictly increasing typical price → all positive MF → returns 100
    const candles = trendingCandles(30, 100, 5)
    expect(computeMFI(candles, 14)).toBe(100)
  })
})

// ─── computeROC ───────────────────────────────────────────────────────────────

describe("computeROC", () => {
  it("returns null when not enough data", () => {
    expect(computeROC([1, 2, 3], 12)).toBeNull()
  })

  it("positive for uptrend", () => {
    const closes = trendingCandles(20).map(c => c.close)
    expect(computeROC(closes, 12)).toBeGreaterThan(0)
  })

  it("exact calculation", () => {
    // [100, 110] with period 1 → ROC = (110 - 100) / 100 * 100 = 10
    expect(computeROC([100, 110], 1)).toBeCloseTo(10, 1)
  })
})

// ─── computeAroon ────────────────────────────────────────────────────────────

describe("computeAroon", () => {
  it("returns null when not enough data", () => {
    expect(computeAroon(flatCandles(5), 25)).toBeNull()
  })

  it("up and down in [0, 100]", () => {
    const a = computeAroon(trendingCandles(40), 25)
    expect(a.up).toBeGreaterThanOrEqual(0)
    expect(a.up).toBeLessThanOrEqual(100)
    expect(a.down).toBeGreaterThanOrEqual(0)
    expect(a.down).toBeLessThanOrEqual(100)
  })

  it("oscillator = up - down", () => {
    const a = computeAroon(choppyCandles(40), 25)
    expect(a.oscillator).toBeCloseTo(a.up - a.down, 1)
  })

  it("Aroon Up near 100 in strong uptrend", () => {
    const candles = trendingCandles(40, 100, 3)
    const a = computeAroon(candles, 25)
    expect(a.up).toBe(100)
  })
})

// ─── computeADX ───────────────────────────────────────────────────────────────

describe("computeADX", () => {
  it("returns null when not enough data", () => {
    expect(computeADX(flatCandles(10), 14)).toBeNull()
  })

  it("ADX in [0, 100]", () => {
    const adx = computeADX(trendingCandles(60), 14)
    expect(adx).not.toBeNull()
    expect(adx.adx).toBeGreaterThanOrEqual(0)
    expect(adx.adx).toBeLessThanOrEqual(100)
  })

  it("plusDI > minusDI in uptrend", () => {
    const adx = computeADX(trendingCandles(60, 100, 3), 14)
    expect(adx.plusDI).toBeGreaterThan(adx.minusDI)
  })

  it("minusDI > plusDI in downtrend", () => {
    const adx = computeADX(trendingCandles(60, 200, -3), 14)
    expect(adx.minusDI).toBeGreaterThan(adx.plusDI)
  })
})

// ─── computeParabolicSAR ──────────────────────────────────────────────────────

describe("computeParabolicSAR", () => {
  it("returns null when not enough data", () => {
    expect(computeParabolicSAR(flatCandles(3))).toBeNull()
  })

  it("trend is bullish or bearish", () => {
    const sar = computeParabolicSAR(trendingCandles(20))
    expect(["bullish", "bearish"]).toContain(sar.trend)
  })

  it("bullish in strong uptrend", () => {
    const sar = computeParabolicSAR(trendingCandles(30, 100, 5))
    expect(sar.trend).toBe("bullish")
  })

  it("bearish in strong downtrend", () => {
    const sar = computeParabolicSAR(trendingCandles(30, 200, -5))
    expect(sar.trend).toBe("bearish")
  })
})

// ─── computeOBV ───────────────────────────────────────────────────────────────

describe("computeOBV", () => {
  it("returns null when not enough data", () => {
    expect(computeOBV([{ close: 1, volume: 100 }])).toBeNull()
  })

  it("increases when price rises", () => {
    const candles = trendingCandles(10)
    expect(computeOBV(candles)).toBeGreaterThan(0)
  })

  it("decreases when price falls", () => {
    const candles = trendingCandles(10, 200, -3)
    expect(computeOBV(candles)).toBeLessThan(0)
  })

  it("returns integer", () => {
    const obv = computeOBV(trendingCandles(20))
    expect(Number.isInteger(obv)).toBe(true)
  })
})

// ─── computeAllIndicators ────────────────────────────────────────────────────

describe("computeAllIndicators", () => {
  const candles = trendingCandles(80, 100, 1)

  it("returns all expected top-level keys", () => {
    const ind = computeAllIndicators(candles)
    expect(ind).toHaveProperty("price")
    expect(ind).toHaveProperty("movingAverages")
    expect(ind).toHaveProperty("rsi")
    expect(ind).toHaveProperty("macd")
    expect(ind).toHaveProperty("bollingerBands")
    expect(ind).toHaveProperty("stochastic")
    expect(ind).toHaveProperty("williamsR")
    expect(ind).toHaveProperty("cci")
    expect(ind).toHaveProperty("mfi")
    expect(ind).toHaveProperty("aroon")
    expect(ind).toHaveProperty("adx")
    expect(ind).toHaveProperty("parabolicSar")
    expect(ind).toHaveProperty("atr")
    expect(ind).toHaveProperty("obv")
  })

  it("price equals last candle close", () => {
    const ind = computeAllIndicators(candles)
    expect(ind.price).toBe(candles[candles.length - 1].close)
  })

  it("movingAverages contains sma and ema values", () => {
    const ind = computeAllIndicators(candles)
    expect(ind.movingAverages).toHaveProperty("sma20")
    expect(ind.movingAverages).toHaveProperty("sma50")
    expect(ind.movingAverages).toHaveProperty("ema12")
    expect(ind.movingAverages).toHaveProperty("ema26")
  })

  it("BB middle ≈ SMA20", () => {
    const ind = computeAllIndicators(candles)
    if (ind.bollingerBands && ind.movingAverages.sma20) {
      expect(ind.bollingerBands.middle).toBeCloseTo(ind.movingAverages.sma20, 1)
    }
  })

  it("MACD ema12 ≈ movingAverages.ema12", () => {
    const ind = computeAllIndicators(candles)
    if (ind.macd && ind.movingAverages.ema12) {
      expect(ind.macd.ema12).toBeCloseTo(ind.movingAverages.ema12, 1)
    }
  })
})

// ─── computeSignalVotes ───────────────────────────────────────────────────────

describe("computeSignalVotes", () => {
  it("returns null direction for empty indicator list", () => {
    const ind = computeAllIndicators(trendingCandles(80))
    const { direction } = computeSignalVotes(ind, [])
    expect(direction).toBeNull()
  })

  it("returns null direction when no indicators enabled", () => {
    const ind = computeAllIndicators(trendingCandles(80))
    const { direction } = computeSignalVotes(ind, ["atr"])  // atr is neutral
    expect(direction).toBeNull()
  })

  it("bulls in strong uptrend with standard indicators", () => {
    const candles = trendingCandles(80, 100, 3)
    const ind = computeAllIndicators(candles)
    const { direction } = computeSignalVotes(ind, ["ema", "sma", "macd", "parabolic_sar"])
    expect(direction).toBe("bull")
  })

  it("bears in strong downtrend with standard indicators", () => {
    const candles = trendingCandles(80, 500, -5)
    const ind = computeAllIndicators(candles)
    const { direction } = computeSignalVotes(ind, ["ema", "sma", "macd", "parabolic_sar"])
    expect(direction).toBe("bear")
  })

  it("RSI-oversold signals bull", () => {
    // Build candles with severe downtrend then flat — RSI should be very low
    const crashThenFlat = [
      ...trendingCandles(20, 200, -8),
      ...flatCandles(5, 40),
    ]
    const ind = computeAllIndicators(crashThenFlat)
    // RSI should be low (oversold)
    if (ind.rsi !== null && ind.rsi < 35) {
      const { direction } = computeSignalVotes(ind, ["rsi"])
      expect(direction).toBe("bull")
    }
  })

  it("score is in [-1, +1]", () => {
    const ind = computeAllIndicators(trendingCandles(80))
    const { score } = computeSignalVotes(ind, ["rsi", "macd", "bollinger_bands", "ema", "sma"])
    expect(score).toBeGreaterThanOrEqual(-1)
    expect(score).toBeLessThanOrEqual(1)
  })

  it("votes count equals number of valid enabled indicators", () => {
    const ind = computeAllIndicators(trendingCandles(80))
    // rsi, macd, ema, sma all have sufficient data in 80 candles
    const { votes } = computeSignalVotes(ind, ["rsi", "macd", "ema", "sma"])
    expect(votes).toBe(4)
  })

  it("higher minConfidence requires stronger signal to produce direction", () => {
    const candles = choppyCandles(80)  // weak signal
    const ind = computeAllIndicators(candles)
    const enabled = ["rsi", "macd", "ema", "sma", "bollinger_bands"]

    const { direction: dirLow } = computeSignalVotes(ind, enabled, 0.1)
    const { direction: dirHigh } = computeSignalVotes(ind, enabled, 0.99)

    // High confidence threshold should produce fewer/no directions on choppy data
    if (dirHigh !== null) {
      // If high confidence gives a direction, low confidence must also give one
      expect(dirLow).not.toBeNull()
    }
  })
})
