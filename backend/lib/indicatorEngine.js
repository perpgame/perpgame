// ─── Indicator Engine ─────────────────────────────────────────────────────────
// All compute* functions extracted from routes/agentTrading.js so they can be
// shared with the backtesting route without circular imports.

export function computeEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return Math.round(ema * 100) / 100;
}

export function computeSMA(closes, period) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return Math.round((slice.reduce((s, v) => s + v, 0) / period) * 100) / 100;
}

export function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta > 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

export function computeMACD(closes) {
  if (closes.length < 35) return null;
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
  let ema12 = closes.slice(0, 12).reduce((s, v) => s + v, 0) / 12;
  let ema26 = closes.slice(0, 26).reduce((s, v) => s + v, 0) / 26;
  const macdValues = [];
  for (let i = 0; i < closes.length; i++) {
    if (i >= 12) ema12 = closes[i] * k12 + ema12 * (1 - k12);
    if (i >= 26) {
      ema26 = closes[i] * k26 + ema26 * (1 - k26);
      macdValues.push(ema12 - ema26);
    }
  }
  if (macdValues.length < 9) return null;
  let signal = macdValues.slice(0, 9).reduce((s, v) => s + v, 0) / 9;
  for (let i = 9; i < macdValues.length; i++) {
    signal = macdValues[i] * k9 + signal * (1 - k9);
  }
  const macdLine = macdValues[macdValues.length - 1];
  const histogram = macdLine - signal;
  return {
    macdLine: Math.round(macdLine * 100) / 100,
    signal: Math.round(signal * 100) / 100,
    histogram: Math.round(histogram * 100) / 100,
    ema12: Math.round(ema12 * 100) / 100,
    ema26: Math.round(ema26 * 100) / 100,
  };
}

export function computeBollingerBands(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  return {
    upper: Math.round((sma + 2 * stdDev) * 100) / 100,
    middle: Math.round(sma * 100) / 100,
    lower: Math.round((sma - 2 * stdDev) * 100) / 100,
    width: Math.round((4 * stdDev / sma) * 10000) / 100,
  };
}

export function computeATR(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const recent = candles.slice(-period - 1);
  let sum = 0;
  for (let i = 1; i < recent.length; i++) {
    const tr = Math.max(
      recent[i].high - recent[i].low,
      Math.abs(recent[i].high - recent[i - 1].close),
      Math.abs(recent[i].low - recent[i - 1].close),
    );
    sum += tr;
  }
  return Math.round((sum / period) * 100) / 100;
}

export function computeStochastic(candles, period = 14, smooth = 3) {
  if (candles.length < period + smooth - 1) return null;
  const kValues = [];
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1);
    const lowestLow = Math.min(...slice.map(c => c.low));
    const highestHigh = Math.max(...slice.map(c => c.high));
    const range = highestHigh - lowestLow;
    kValues.push(range === 0 ? 50 : ((candles[i].close - lowestLow) / range) * 100);
  }
  const k = Math.round(kValues[kValues.length - 1] * 10) / 10;
  const dSlice = kValues.slice(-smooth);
  const d = Math.round((dSlice.reduce((s, v) => s + v, 0) / dSlice.length) * 10) / 10;
  return { k, d };
}

export function computeWilliamsR(candles, period = 14) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const highestHigh = Math.max(...slice.map(c => c.high));
  const lowestLow = Math.min(...slice.map(c => c.low));
  const range = highestHigh - lowestLow;
  if (range === 0) return -50;
  return Math.round(((highestHigh - slice[slice.length - 1].close) / range) * -1000) / 10;
}

export function computeCCI(candles, period = 20) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const tps = slice.map(c => (c.high + c.low + c.close) / 3);
  const sma = tps.reduce((s, v) => s + v, 0) / period;
  const meanDev = tps.reduce((s, v) => s + Math.abs(v - sma), 0) / period;
  if (meanDev === 0) return 0;
  return Math.round(((tps[tps.length - 1] - sma) / (0.015 * meanDev)) * 10) / 10;
}

export function computeMFI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const recent = candles.slice(-(period + 1));
  let posMF = 0, negMF = 0;
  for (let i = 1; i < recent.length; i++) {
    const tp = (recent[i].high + recent[i].low + recent[i].close) / 3;
    const prevTp = (recent[i - 1].high + recent[i - 1].low + recent[i - 1].close) / 3;
    const rawMF = tp * recent[i].volume;
    if (tp > prevTp) posMF += rawMF;
    else if (tp < prevTp) negMF += rawMF;
  }
  if (negMF === 0) return 100;
  const mfr = posMF / negMF;
  return Math.round((100 - 100 / (1 + mfr)) * 10) / 10;
}

export function computeROC(closes, period = 12) {
  if (closes.length < period + 1) return null;
  const current = closes[closes.length - 1];
  const previous = closes[closes.length - 1 - period];
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export function computeAroon(candles, period = 25) {
  if (candles.length < period + 1) return null;
  const slice = candles.slice(-(period + 1));
  let highIdx = 0, lowIdx = 0;
  for (let i = 1; i <= period; i++) {
    if (slice[i].high >= slice[highIdx].high) highIdx = i;
    if (slice[i].low <= slice[lowIdx].low) lowIdx = i;
  }
  const up = Math.round(((period - (period - highIdx)) / period) * 1000) / 10;
  const down = Math.round(((period - (period - lowIdx)) / period) * 1000) / 10;
  return { up, down, oscillator: Math.round((up - down) * 10) / 10 };
}

export function computeVortex(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const recent = candles.slice(-(period + 1));
  let vmPlus = 0, vmMinus = 0, trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    vmPlus += Math.abs(recent[i].high - recent[i - 1].low);
    vmMinus += Math.abs(recent[i].low - recent[i - 1].high);
    trSum += Math.max(
      recent[i].high - recent[i].low,
      Math.abs(recent[i].high - recent[i - 1].close),
      Math.abs(recent[i].low - recent[i - 1].close),
    );
  }
  if (trSum === 0) return null;
  return {
    viPlus: Math.round((vmPlus / trSum) * 1000) / 1000,
    viMinus: Math.round((vmMinus / trSum) * 1000) / 1000,
  };
}

export function computeTRIX(closes, period = 15) {
  if (closes.length < period * 3 + 1) return null;
  const k = 2 / (period + 1);
  let ema1 = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const ema1Series = [ema1];
  for (let i = period; i < closes.length; i++) {
    ema1 = closes[i] * k + ema1 * (1 - k);
    ema1Series.push(ema1);
  }
  if (ema1Series.length < period) return null;
  let ema2 = ema1Series.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const ema2Series = [ema2];
  for (let i = period; i < ema1Series.length; i++) {
    ema2 = ema1Series[i] * k + ema2 * (1 - k);
    ema2Series.push(ema2);
  }
  if (ema2Series.length < period) return null;
  let ema3 = ema2Series.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let prevEma3 = ema3;
  for (let i = period; i < ema2Series.length; i++) {
    prevEma3 = ema3;
    ema3 = ema2Series[i] * k + ema3 * (1 - k);
  }
  if (prevEma3 === 0) return 0;
  return Math.round(((ema3 - prevEma3) / prevEma3) * 10000) / 100;
}

export function computeADX(candles, period = 14) {
  if (candles.length < period * 2 + 1) return null;
  const trs = [], plusDMs = [], minusDMs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    trs.push(tr);
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  if (trs.length < period) return null;
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0);
  let plusDM = plusDMs.slice(0, period).reduce((s, v) => s + v, 0);
  let minusDM = minusDMs.slice(0, period).reduce((s, v) => s + v, 0);
  const dxValues = [];
  for (let i = period; i < trs.length; i++) {
    atr = atr - atr / period + trs[i];
    plusDM = plusDM - plusDM / period + plusDMs[i];
    minusDM = minusDM - minusDM / period + minusDMs[i];
    const plusDI = atr > 0 ? (plusDM / atr) * 100 : 0;
    const minusDI = atr > 0 ? (minusDM / atr) * 100 : 0;
    const diSum = plusDI + minusDI;
    dxValues.push(diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0);
  }
  if (dxValues.length < period) return null;
  let adx = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }
  const plusDI = atr > 0 ? Math.round((plusDM / atr) * 1000) / 10 : 0;
  const minusDI = atr > 0 ? Math.round((minusDM / atr) * 1000) / 10 : 0;
  return { adx: Math.round(adx * 10) / 10, plusDI, minusDI };
}

export function computeParabolicSAR(candles, afStart = 0.02, afMax = 0.2) {
  if (candles.length < 5) return null;
  let isUpTrend = candles[1].close > candles[0].close;
  let sar = isUpTrend ? candles[0].low : candles[0].high;
  let ep = isUpTrend ? candles[1].high : candles[1].low;
  let af = afStart;
  for (let i = 2; i < candles.length; i++) {
    sar = sar + af * (ep - sar);
    if (isUpTrend) {
      sar = Math.min(sar, candles[i - 1].low, candles[i - 2].low);
      if (candles[i].low < sar) {
        isUpTrend = false; sar = ep; ep = candles[i].low; af = afStart;
      } else if (candles[i].high > ep) {
        ep = candles[i].high; af = Math.min(af + afStart, afMax);
      }
    } else {
      sar = Math.max(sar, candles[i - 1].high, candles[i - 2].high);
      if (candles[i].high > sar) {
        isUpTrend = true; sar = ep; ep = candles[i].high; af = afStart;
      } else if (candles[i].low < ep) {
        ep = candles[i].low; af = Math.min(af + afStart, afMax);
      }
    }
  }
  return { sar: Math.round(sar * 100) / 100, trend: isUpTrend ? "bullish" : "bearish" };
}

export function computeKeltnerChannels(candles, closes, emaPeriod = 20, atrPeriod = 10, multiplier = 2) {
  const ema = computeEMA(closes, emaPeriod);
  const atr = computeATR(candles, atrPeriod);
  if (ema === null || atr === null) return null;
  return {
    upper: Math.round((ema + multiplier * atr) * 100) / 100,
    middle: ema,
    lower: Math.round((ema - multiplier * atr) * 100) / 100,
  };
}

export function computeDonchianChannels(candles, period = 20) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const upper = Math.max(...slice.map(c => c.high));
  const lower = Math.min(...slice.map(c => c.low));
  return {
    upper: Math.round(upper * 100) / 100,
    middle: Math.round(((upper + lower) / 2) * 100) / 100,
    lower: Math.round(lower * 100) / 100,
  };
}

export function computeOBV(candles) {
  if (candles.length < 2) return null;
  let obv = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
  }
  return Math.round(obv);
}

// ─── computeAllIndicators ─────────────────────────────────────────────────────
// Computes the full indicator snapshot for a candle array.
// Identical output shape to the /market-data/indicators route.
export function computeAllIndicators(candles) {
  const closes = candles.map(c => c.close);
  const currentPrice = closes[closes.length - 1];
  return {
    price: currentPrice,
    movingAverages: {
      sma20: computeSMA(closes, 20),
      sma50: computeSMA(closes, 50),
      sma200: computeSMA(closes, 200),
      ema12: computeEMA(closes, 12),
      ema26: computeEMA(closes, 26),
      ema50: computeEMA(closes, 50),
    },
    rsi: computeRSI(closes, 14),
    macd: computeMACD(closes),
    stochastic: computeStochastic(candles, 14),
    williamsR: computeWilliamsR(candles, 14),
    cci: computeCCI(candles, 20),
    mfi: computeMFI(candles, 14),
    roc: computeROC(closes, 12),
    aroon: computeAroon(candles, 25),
    vortex: computeVortex(candles, 14),
    trix: computeTRIX(closes, 15),
    adx: computeADX(candles, 14),
    parabolicSar: computeParabolicSAR(candles),
    bollingerBands: computeBollingerBands(closes, 20),
    keltnerChannels: computeKeltnerChannels(candles, closes, 20, 10, 2),
    donchianChannels: computeDonchianChannels(candles, 20),
    atr: computeATR(candles, 14),
    obv: computeOBV(candles),
  };
}

// ─── computeSignalVotes ───────────────────────────────────────────────────────
// Each enabled indicator casts a vote: +1 (bull), -1 (bear), 0 (neutral).
// Returns { direction: 'bull'|'bear'|null, score, votes, rawVotes }
// logic: "majority" (default) — net score must exceed threshold
//        "consensus" — ALL non-neutral votes must agree (no opposing signals)
export function computeSignalVotes(ind, enabledList, minConfidence = 0.5, logic = "majority") {
  const enabled = new Set(enabledList || []);
  let sum = 0, count = 0;
  const rawVotes = [];

  function vote(v) { sum += v; count++; rawVotes.push(v); }

  if (enabled.has('rsi') && ind.rsi != null) {
    vote(ind.rsi < 35 ? 1 : ind.rsi > 65 ? -1 : 0);
  }
  if (enabled.has('macd') && ind.macd?.histogram != null) {
    vote(ind.macd.histogram > 0 ? 1 : -1);
  }
  if (enabled.has('bollinger_bands') && ind.bollingerBands && ind.price != null) {
    const { upper, lower } = ind.bollingerBands;
    vote(ind.price < lower ? 1 : ind.price > upper ? -1 : 0);
  }
  if (enabled.has('sma') && ind.movingAverages?.sma50 != null && ind.price != null) {
    vote(ind.price > ind.movingAverages.sma50 ? 1 : -1);
  }
  if (enabled.has('ema') && ind.movingAverages?.ema12 != null && ind.movingAverages?.ema26 != null) {
    vote(ind.movingAverages.ema12 > ind.movingAverages.ema26 ? 1 : -1);
  }
  if (enabled.has('stochastic') && ind.stochastic?.k != null) {
    vote(ind.stochastic.k < 20 ? 1 : ind.stochastic.k > 80 ? -1 : 0);
  }
  if (enabled.has('williams_r') && ind.williamsR != null) {
    vote(ind.williamsR < -80 ? 1 : ind.williamsR > -20 ? -1 : 0);
  }
  if (enabled.has('cci') && ind.cci != null) {
    vote(ind.cci < -100 ? 1 : ind.cci > 100 ? -1 : 0);
  }
  if (enabled.has('mfi') && ind.mfi != null) {
    vote(ind.mfi < 20 ? 1 : ind.mfi > 80 ? -1 : 0);
  }
  if (enabled.has('parabolic_sar') && ind.parabolicSar?.trend != null) {
    vote(ind.parabolicSar.trend === 'bullish' ? 1 : -1);
  }
  if (enabled.has('adx') && ind.adx?.adx != null) {
    if (ind.adx.adx > 20) {
      vote(ind.adx.plusDI > ind.adx.minusDI ? 1 : -1);
    } else {
      vote(0);
    }
  }
  if (enabled.has('aroon') && ind.aroon != null) {
    vote(ind.aroon.up > 70 ? 1 : ind.aroon.down > 70 ? -1 : 0);
  }
  if (enabled.has('obv') && ind.obv != null && ind._prevObv != null) {
    vote(ind.obv > ind._prevObv ? 1 : ind.obv < ind._prevObv ? -1 : 0);
  }
  // atr, roc, trix, vortex, keltner, donchian: context only, not directional votes

  if (count === 0) return { direction: null, score: 0, votes: 0 };

  const score = sum / count;
  const absScore = Math.abs(score);
  const threshold = minConfidence * 0.2;

  let direction = null;
  if (logic === "consensus") {
    // All non-zero votes must point the same way — no opposing signals allowed
    const decisive = rawVotes.filter(v => v !== 0);
    const hasBull = decisive.some(v => v > 0);
    const hasBear = decisive.some(v => v < 0);
    if (decisive.length > 0 && !hasBull !== !hasBear) {
      // Pure consensus: only one direction present among decisive votes
      direction = hasBull ? "bull" : "bear";
    }
  } else {
    // Majority: net score must exceed threshold
    direction = absScore > threshold ? (score > 0 ? "bull" : "bear") : null;
  }

  return { direction, score: Math.round(score * 1000) / 1000, votes: count };
}

// ─── Condition evaluator ──────────────────────────────────────────────────────
// Resolves a dot-notation path from the indicator snapshot.
// e.g. "adx.adx" → ind.adx.adx, "movingAverages.sma50" → ind.movingAverages.sma50
export function resolvePath(ind, path) {
  return path.split('.').reduce((obj, key) => (obj == null ? null : obj[key]), ind) ?? null;
}

const BACKTEST_UNAVAILABLE = new Set(['obImbalance', 'fundingRate']);
const VALID_OPERATORS = new Set(['>', '<']);

// Validates a single condition object. Returns an error string or null.
export function validateCondition(c) {
  if (!c || typeof c.path !== 'string' || !c.path) return 'condition missing path';
  if (!VALID_OPERATORS.has(c.operator)) return `invalid operator "${c.operator}"`;
  const root = c.path.split('.')[0];
  if (BACKTEST_UNAVAILABLE.has(root)) return `"${c.path}" is real-time only and cannot be backtested`;
  if (c.value == null && c.compare == null && c.strValue == null) {
    return `condition for "${c.path}" requires value, compare, or strValue`;
  }
  return null;
}

// Evaluates a single condition against one indicator snapshot.
function evaluateCondition(ind, c) {
  const left = resolvePath(ind, c.path);
  if (left == null) return false; // indicator not available yet (warmup)

  const right = c.compare != null ? resolvePath(ind, c.compare)
    : c.strValue != null ? c.strValue
    : c.value;
  if (right == null) return false;

  switch (c.operator) {
    case '>':  return left > right;
    case '<':  return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
    default:   return false;
  }
}

// Evaluates all conditions against one indicator snapshot.
// logic "all" = AND (every condition must pass)
// logic "any" = OR  (at least one must pass)
export function evaluateConditions(ind, conditions, logic = 'all') {
  if (!conditions || conditions.length === 0) return false;
  const results = conditions.map(c => evaluateCondition(ind, c));
  return logic === 'all' ? results.every(Boolean) : results.some(Boolean);
}

// ─── classifyRegime ───────────────────────────────────────────────────────────
// Returns "trending" | "ranging" | null based on ADX value.
// Kept for backward compatibility with existing backtest code.
export function classifyRegime(ind, adxThreshold = 25) {
  const adx = ind.adx?.adx;
  if (adx == null) return null;
  return adx >= adxThreshold ? "trending" : "ranging";
}

// ─── classifyMarketRegime ─────────────────────────────────────────────────────
// Full 4-regime classification per strategy.md Layer 3.
// Returns "trending" | "mean_reverting" | "volatile" | "choppy" | null
//
// priceAtCall: current close price (needed for Bollinger Band containment check)
// percentileThresholds: optional { bbWidth90: number, atr90: number }
//   When omitted, uses heuristic thresholds:
//   - volatile if bbWidth > 8% (wide bands) or ATR/price > 2%
export function classifyMarketRegime(ind, priceAtCall, percentileThresholds = null) {
  const adx = ind.adx?.adx ?? ind.adx ?? null;
  const bbUpper = ind.bollingerBands?.upper ?? ind.bbUpper ?? null;
  const bbLower = ind.bollingerBands?.lower ?? ind.bbLower ?? null;
  const bbWidth = ind.bollingerBands?.width ?? ind.bbWidth ?? null;  // as percentage
  const atr     = ind.atr ?? null;

  // Trending: ADX > 25
  if (adx != null && adx > 25) return 'trending';

  // Volatile: BBWidth or ATR exceeds 90th-percentile threshold
  const bbWidthPct = bbWidth != null ? bbWidth : null;  // already in % from engine
  const atrPct     = (atr != null && priceAtCall > 0) ? (atr / priceAtCall * 100) : null;

  const bbThresh  = percentileThresholds?.bbWidth90 ?? 8.0;   // 8% bbWidth as fallback
  const atrThresh = percentileThresholds?.atr90     ?? 2.0;   // 2% ATR/price as fallback

  if ((bbWidthPct != null && bbWidthPct > bbThresh) || (atrPct != null && atrPct > atrThresh)) {
    return 'volatile';
  }

  // Mean-reverting: ADX < 20 AND price contained within Bollinger Bands
  if (adx != null && adx < 20 && bbUpper != null && bbLower != null && priceAtCall != null) {
    if (priceAtCall >= bbLower && priceAtCall <= bbUpper) return 'mean_reverting';
  }

  return 'choppy';
}

// ─── classifyFundingRegime ────────────────────────────────────────────────────
// Portfolio-level funding regime per strategy.md Layer 3.
// fundingRates: array of numbers (8h funding rates across active coins)
// Returns "funding_long" | "funding_short" | "funding_neutral"
export function classifyFundingRegime(fundingRates) {
  if (!Array.isArray(fundingRates) || fundingRates.length === 0) return 'funding_neutral';
  const mean = fundingRates.reduce((s, r) => s + r, 0) / fundingRates.length;
  if (mean > 0.0001) return 'funding_long';
  if (mean < -0.0001) return 'funding_short';
  return 'funding_neutral';
}

// ─── computeBacktestStats ─────────────────────────────────────────────────────
// Computes rich metrics from a decided outcomes array (+1 or -1 only, no 0).
export function computeBacktestStats(decided) {
  const n = decided.length;
  if (n === 0) return { sharpe: null, sortino: null, maxDrawdown: 0, profitFactor: null, sqn: null };

  const mean = decided.reduce((s, r) => s + r, 0) / n;
  const variance = decided.reduce((s, r) => s + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? Math.round(mean / std * 100) / 100 : null;

  // Sortino: downside deviation only (target = 0)
  const downsideVariance = decided.reduce((s, r) => s + (r < 0 ? r * r : 0), 0) / n;
  const downsideStd = Math.sqrt(downsideVariance);
  const sortino = downsideStd > 0 ? Math.round(mean / downsideStd * 100) / 100 : (mean > 0 ? 9.99 : null);

  // Max drawdown from equity curve, expressed as % of total signal count
  let equity = 0, peak = 0, maxDd = 0;
  for (const r of decided) {
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  const maxDrawdown = Math.round(maxDd / n * 1000) / 10;

  // Profit factor: wins / losses (equal unit sizing)
  const wins = decided.filter(r => r > 0).length;
  const losses = decided.filter(r => r < 0).length;
  const profitFactor = losses > 0 ? Math.round(wins / losses * 100) / 100 : null;

  // SQN (System Quality Number): meaningful only with 30+ signals
  const sqn = std > 0 && n >= 30 ? Math.round(Math.sqrt(n) * mean / std * 100) / 100 : null;

  return { sharpe, sortino, maxDrawdown, profitFactor, sqn };
}
