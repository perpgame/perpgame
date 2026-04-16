// ─── Kelly Fraction Engine ────────────────────────────────────────────────────
// ATR-normalized Kelly computation + CVaR-capped position sizing.
// Per strategy.md Layer 5. All inputs must use NET deltas (after execution costs).

// ─── Kelly fraction ───────────────────────────────────────────────────────────
// netDeltas: array of { netDelta, atrAtCall, outcome }
//   netDelta:  signed net return fraction (positive = profit, negative = loss)
//   atrAtCall: ATR value at prediction time (for normalization)
//   outcome:   'correct' | 'wrong' | 'neutral'
//
// Returns { kelly, b, p, q, avgDeltaCorrect, avgDeltaWrong, informationRatio } or null
export function computeKelly(netDeltas) {
  const decided = netDeltas.filter(d => d.outcome !== 'neutral' && d.netDelta != null);
  if (decided.length === 0) return null;

  const wins   = decided.filter(d => d.outcome === 'correct');
  const losses = decided.filter(d => d.outcome === 'wrong');
  if (wins.length === 0 || losses.length === 0) {
    // All wins or all losses — no meaningful ratio
    const p = wins.length / decided.length;
    return { kelly: p > 0.5 ? 1 : -1, b: null, p, q: 1 - p, avgDeltaCorrect: null, avgDeltaWrong: null, informationRatio: null };
  }

  // ATR-normalize deltas: express magnitude in ATR units
  const normalizeOne = d => {
    const mag = Math.abs(d.netDelta);
    return d.atrAtCall > 0 ? mag / d.atrAtCall : mag;
  };

  const avgDeltaCorrect = mean(wins.map(normalizeOne));
  const avgDeltaWrong   = mean(losses.map(normalizeOne));

  if (avgDeltaWrong === 0) return null;

  const p = wins.length / decided.length;
  const q = 1 - p;
  const b = avgDeltaCorrect / avgDeltaWrong;
  const kelly = (b * p - q) / b;

  // Information Ratio: meanReturn / stdDevReturn (on raw net deltas, not ATR-normalized)
  const rawDeltas = decided.map(d => d.netDelta);
  const ir = computeIR(rawDeltas);

  return {
    kelly: Math.round(kelly * 10000) / 10000,
    b:     Math.round(b * 10000) / 10000,
    p:     Math.round(p * 10000) / 10000,
    q:     Math.round(q * 10000) / 10000,
    avgDeltaCorrect: Math.round(avgDeltaCorrect * 10000) / 10000,
    avgDeltaWrong:   Math.round(avgDeltaWrong   * 10000) / 10000,
    informationRatio: ir,
  };
}

// ─── Information Ratio ────────────────────────────────────────────────────────
// IR = meanReturn / stdDevReturn on net deltas per trade.
export function computeIR(netDeltas) {
  if (!netDeltas || netDeltas.length < 2) return null;
  const m = mean(netDeltas);
  const s = stdDev(netDeltas);
  if (s === 0) return null;
  return Math.round(m / s * 100) / 100;
}

// ─── CVaR(95%) ───────────────────────────────────────────────────────────────
// Expected loss in the worst 5% of outcomes, as a fraction of notional.
// netDeltas: array of signed net return fractions
export function computeCVaR95(netDeltas) {
  if (!netDeltas || netDeltas.length < 20) return null;
  const sorted = [...netDeltas].sort((a, b) => a - b);
  const cutoff = Math.max(1, Math.floor(sorted.length * 0.05));
  const tail = sorted.slice(0, cutoff);
  return Math.round(mean(tail) * 10000) / 10000;
}

// ─── Position sizing ──────────────────────────────────────────────────────────
// Half-Kelly with CVaR hard cap (strategy.md Layer 5).
// kelly:        kelly fraction (0–1)
// cvar95:       expected loss in worst 5% (negative number, e.g. -0.031)
// accountValue: total account value in USD
// Returns position size in USD
export function computePositionSize(kelly, cvar95, accountValue) {
  if (kelly <= 0 || !accountValue) return 0;

  const halfKelly = 0.5 * kelly * accountValue;

  // CVaR cap: max size such that expected tail loss < 2% of account
  let cvarCap = Infinity;
  if (cvar95 != null && cvar95 < 0) {
    cvarCap = (0.02 * accountValue) / Math.abs(cvar95);
  }

  return Math.round(Math.min(halfKelly, cvarCap) * 100) / 100;
}

// ─── Full strategy stats ──────────────────────────────────────────────────────
// Compute all metrics from a set of prediction rows.
// predictions: array of { outcome, netDelta, atrAtCall, confidence, createdAt, marketRegime }
export function computeStrategyStats(predictions) {
  const scored = predictions.filter(p => p.outcome === 'correct' || p.outcome === 'wrong');
  if (scored.length === 0) {
    return { signals: 0, accuracy: null, ciLower: null, ciUpper: null,
             kellyFraction: null, informationRatio: null, cvar95: null,
             meanReturn: null, stdDevReturn: null, timeSpanDays: 0,
             regimeAccuracy: {} };
  }

  const correct   = scored.filter(p => p.outcome === 'correct');
  const accuracy  = Math.round(correct.length / scored.length * 1000) / 10;
  const netDeltas = scored.map(p => p.netDelta).filter(v => v != null);

  // Bootstrap CI (inline to avoid circular imports)
  const outcomes = scored.map(p => p.outcome);
  const ci = _bootstrapCI(outcomes);

  // Kelly
  const kellyInput = scored.map(p => ({
    netDelta: p.netDelta,
    atrAtCall: p.atrAtCall,
    outcome: p.outcome,
  }));
  const kellyResult = computeKelly(kellyInput);

  // CVaR
  const cvar95 = netDeltas.length >= 20 ? computeCVaR95(netDeltas) : null;

  // Time span
  const times = predictions.map(p => new Date(p.createdAt).getTime()).sort((a, b) => a - b);
  const timeSpanDays = times.length >= 2
    ? Math.round((times[times.length - 1] - times[0]) / (1000 * 60 * 60 * 24))
    : 0;

  // Mean and std of net returns
  const meanReturn = netDeltas.length > 0 ? Math.round(mean(netDeltas) * 10000) / 10000 : null;
  const stdDevReturn = netDeltas.length > 1 ? Math.round(stdDev(netDeltas) * 10000) / 10000 : null;

  // Per-regime accuracy
  const regimeAccuracy = {};
  for (const p of scored) {
    const r = p.marketRegime || 'unknown';
    if (!regimeAccuracy[r]) regimeAccuracy[r] = { signals: 0, correct: 0 };
    regimeAccuracy[r].signals++;
    if (p.outcome === 'correct') regimeAccuracy[r].correct++;
  }
  for (const r of Object.keys(regimeAccuracy)) {
    const ra = regimeAccuracy[r];
    ra.accuracy = Math.round(ra.correct / ra.signals * 1000) / 10;
  }

  return {
    signals: scored.length,
    accuracy,
    ciLower: ci.lower,
    ciUpper: ci.upper,
    kellyFraction: kellyResult?.kelly ?? null,
    informationRatio: kellyResult?.informationRatio ?? null,
    cvar95,
    meanReturn,
    stdDevReturn,
    timeSpanDays,
    regimeAccuracy,
  };
}

// ─── Confidence calibration (isotonic regression) ────────────────────────────
// Builds a calibration table from strategy predictions bucketed by confidence.
// Applies Pool Adjacent Violators to enforce monotonicity.
//
// predictions: [{ confidence, outcome }] — scored predictions with confidence values
// Returns: array of { bucketMin, bucketMax, predictedCount, actualAccuracy, isotonicCorrected }
export function buildCalibrationTable(predictions) {
  const buckets = [
    [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.0],
  ];

  const raw = buckets.map(([min, max]) => {
    const inBucket = predictions.filter(p =>
      p.confidence != null && p.confidence >= min && p.confidence < max &&
      (p.outcome === 'correct' || p.outcome === 'wrong')
    );
    const correct = inBucket.filter(p => p.outcome === 'correct').length;
    const accuracy = inBucket.length > 0 ? (correct / inBucket.length) * 100 : null;
    return { bucketMin: min, bucketMax: max, predictedCount: inBucket.length, actualAccuracy: accuracy };
  });

  // Isotonic regression (Pool Adjacent Violators) on non-null buckets
  const values = raw.map(b => b.actualAccuracy);
  const isotonic = poolAdjacentViolators(values);

  return raw.map((b, i) => ({ ...b, isotonicCorrected: isotonic[i] }));
}

// Pool Adjacent Violators algorithm — enforces non-decreasing sequence
function poolAdjacentViolators(values) {
  const result = values.map(v => (v === null ? null : v));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i] === null || result[i + 1] === null) continue;
      if (result[i] > result[i + 1]) {
        const avg = (result[i] + result[i + 1]) / 2;
        result[i] = avg;
        result[i + 1] = avg;
        changed = true;
      }
    }
  }
  return result;
}

// Apply calibration table to a raw confidence score.
// Returns the isotonic-corrected probability (0–1) or null if no matching bucket.
export function applyCalibration(rawConfidence, calibrationTable) {
  if (!calibrationTable || rawConfidence == null) return null;
  const bucket = calibrationTable.find(b =>
    rawConfidence >= b.bucketMin && rawConfidence < b.bucketMax
  );
  if (!bucket || bucket.isotonicCorrected == null) return null;
  return bucket.isotonicCorrected / 100;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function _bootstrapCI(outcomes, samples = 2000, alpha = 0.05) {
  const n = outcomes.length;
  if (n === 0) return { lower: null, upper: null };
  const accuracies = new Array(samples);
  for (let i = 0; i < samples; i++) {
    let c = 0;
    for (let j = 0; j < n; j++) {
      if (outcomes[Math.floor(Math.random() * n)] === 'correct') c++;
    }
    accuracies[i] = (c / n) * 100;
  }
  accuracies.sort((a, b) => a - b);
  return {
    lower: Math.round(accuracies[Math.floor(samples * (alpha / 2))] * 10) / 10,
    upper: Math.round(accuracies[Math.floor(samples * (1 - alpha / 2))] * 10) / 10,
  };
}
