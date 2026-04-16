// ─── Statistical Standards Engine ────────────────────────────────────────────
// Hard-floor validation, bootstrap CIs, and multiple comparisons correction
// per strategy.md Layer 2.

// Promotion gate thresholds (hard floors, not guidelines)
export const PROMOTION_GATES = {
  candidate: {
    minSignals: 50,
    minAccuracy: 52,
  },
  devValidated: {
    minSignals: 200,
    minDays: 90,
    minCiLower: 52,    // ciLower on development accuracy
    minKelly: 0.02,
    minIR: 0.20,
    minCVaR: -0.05,    // CVaR(95%) > -5% per trade
  },
  holdoutValidated: {
    minHoldoutSignals: 50,
    minHoldoutDays: 30,
    minHoldoutCiLower: 50,
    maxDevHoldoutDeviation: 8,  // holdout accuracy within 8pp of dev accuracy
    maxCorrelationWithActive: 0.80,
  },
  shadow: {
    minShadowCycles: 50,
  },
};

// ─── Bootstrap confidence interval ───────────────────────────────────────────
// Uses bootstrap resampling (2000 samples) rather than normal approximation.
// Correct for small samples with non-symmetric outcome distributions.
// outcomes: array of 'correct' | 'wrong' strings (neutrals excluded)
export function bootstrapAccuracyCI(outcomes, samples = 2000, alpha = 0.05) {
  const n = outcomes.length;
  if (n === 0) return { lower: null, upper: null };

  const accuracies = new Array(samples);
  for (let i = 0; i < samples; i++) {
    let correct = 0;
    for (let j = 0; j < n; j++) {
      const pick = outcomes[Math.floor(Math.random() * n)];
      if (pick === 'correct') correct++;
    }
    accuracies[i] = (correct / n) * 100;
  }
  accuracies.sort((a, b) => a - b);

  return {
    lower: Math.round(accuracies[Math.floor(samples * (alpha / 2))] * 10) / 10,
    upper: Math.round(accuracies[Math.floor(samples * (1 - alpha / 2))] * 10) / 10,
  };
}

// ─── Benjamini-Hochberg multiple comparisons correction ──────────────────────
// Controls expected fraction of false discoveries (FDR) among passing tests.
// More power than Bonferroni for 5-10 simultaneous mutations.
// Falls back to Bonferroni if N > 20.
//
// pValues: array of { id, pValue }
// Returns: array of { id, pValue, passes }
export function multipleComparisonCorrection(pValues, alpha = 0.05) {
  const N = pValues.length;
  if (N === 0) return [];

  if (N > 20) {
    // Bonferroni for large N
    const threshold = alpha / N;
    return pValues.map(({ id, pValue }) => ({ id, pValue, passes: pValue <= threshold, method: 'bonferroni' }));
  }

  // Benjamini-Hochberg
  const ranked = [...pValues]
    .sort((a, b) => a.pValue - b.pValue)
    .map((item, idx) => ({ ...item, rank: idx + 1 }));

  return ranked.map(({ id, pValue, rank }) => ({
    id,
    pValue,
    passes: pValue <= (rank / N) * alpha,
    method: 'bh',
  }));
}

// ─── Promotion gate checker ───────────────────────────────────────────────────
// Returns { passes: bool, failures: string[] }
export function checkPromotionGate(stats, gateName) {
  const gate = PROMOTION_GATES[gateName];
  if (!gate) throw new Error(`Unknown gate: ${gateName}`);

  const failures = [];

  if (gate.minSignals  != null && (stats.signals  ?? 0) < gate.minSignals)  failures.push(`signals ${stats.signals} < ${gate.minSignals}`);
  if (gate.minDays     != null && (stats.timeSpanDays ?? 0) < gate.minDays) failures.push(`timeSpan ${stats.timeSpanDays}d < ${gate.minDays}d`);
  if (gate.minCiLower  != null && (stats.ciLower  ?? 0) <= gate.minCiLower) failures.push(`ciLower ${stats.ciLower} <= ${gate.minCiLower}`);
  if (gate.minKelly    != null && (stats.kellyFraction ?? 0) <= gate.minKelly) failures.push(`kelly ${stats.kellyFraction} <= ${gate.minKelly}`);
  if (gate.minIR       != null && (stats.informationRatio ?? 0) <= gate.minIR) failures.push(`IR ${stats.informationRatio} <= ${gate.minIR}`);
  if (gate.minCVaR     != null && (stats.cvar95 ?? -Infinity) <= gate.minCVaR) failures.push(`CVaR95 ${stats.cvar95} <= ${gate.minCVaR}`);
  if (gate.minAccuracy != null && (stats.accuracy ?? 0) <= gate.minAccuracy) failures.push(`accuracy ${stats.accuracy} <= ${gate.minAccuracy}`);

  // Holdout-specific checks
  if (gate.minHoldoutSignals != null && (stats.signals ?? 0) < gate.minHoldoutSignals) failures.push(`holdout signals ${stats.signals} < ${gate.minHoldoutSignals}`);
  if (gate.minHoldoutDays    != null && (stats.timeSpanDays ?? 0) < gate.minHoldoutDays) failures.push(`holdout timeSpan ${stats.timeSpanDays}d < ${gate.minHoldoutDays}d`);
  if (gate.minHoldoutCiLower != null && (stats.ciLower ?? 0) <= gate.minHoldoutCiLower) failures.push(`holdout ciLower ${stats.ciLower} <= ${gate.minHoldoutCiLower}`);

  return { passes: failures.length === 0, failures };
}

// ─── Regime coverage check ────────────────────────────────────────────────────
// A strategy must have at least one regime with n > 30 and accuracy > 55%.
// regimeAccuracy: { trending: { signals, accuracy }, ... }
export function hasRegimeEdge(regimeAccuracy) {
  if (!regimeAccuracy) return false;
  return Object.values(regimeAccuracy).some(r => r.signals > 30 && r.accuracy > 55);
}

// ─── Walk-forward regime coverage ────────────────────────────────────────────
// Folds must collectively span at least 2 distinct regimes.
// folds: [{ regime }]
export function walkForwardCoversRegimes(folds, minRegimes = 2) {
  const regimes = new Set(folds.map(f => f.regime).filter(Boolean));
  return regimes.size >= minRegimes;
}

// ─── p-value from accuracy (one-sided binomial test against 50%) ──────────────
// Uses normal approximation: z = (p_hat - 0.5) / sqrt(0.25 / n)
// Suitable for n >= 30.
export function accuracyPValue(correct, total) {
  if (total === 0) return 1;
  const p_hat = correct / total;
  const z = (p_hat - 0.5) / Math.sqrt(0.25 / total);
  // One-tailed p-value: P(Z > z) using approximation
  return 1 - normalCDF(z);
}

// Standard normal CDF approximation (Abramowitz and Stegun)
function normalCDF(z) {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}
