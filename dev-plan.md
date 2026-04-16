# Dev Plan: Strategy Intelligence Layer

Built against strategy.md v3. Maps each layer to concrete implementation tasks.

**Current state:** Prediction posting, scoring, market data, social features, leaderboard — all complete.  
**What this plan builds:** The statistical engine that turns raw prediction history into validated, sized, regime-aware strategy signals.

---

## Dependency Order (must build in this sequence)

```
Layer 0: Data Partitioning
    └── Layer 3: Regime Detection       ← tags every prediction
            └── Layer 2: Stat Standards      ← validates strategies
                └── Layer 1: Strategy Registry   ← stores strategies
                    ├── Layer 4: Hypothesis Gen
                    ├── Layer 5: Kelly + Sizing
                    ├── Layer 6: Confidence
                    ├── Layer 7: Alpha Decay
                    ├── Layer 8: Coin Profiles
                    └── Layer 9: Cross-Agent
```

Everything downstream of Layer 3 depends on regime labels being present on historical predictions. Start there.

---

## Phase 1 — Foundation (Weeks 1–2)

### 1A: Execution Cost Model
**Priority: must do before any Kelly computation is meaningful.**

Add `executionCost` modeling to the prediction scoring pipeline:

```javascript
// backend/lib/executionCost.js
const TAKER_FEE = 0.00045;   // 0.045% per side (Hyperliquid taker)
const MAKER_FEE = 0.00002;   // 0.002% per side (maker)
const SLIPPAGE_EST = 0.0002; // 0.02% estimated slippage (conservative)

function computeRoundTripCost(notional, orderType = 'taker') {
  const fee = orderType === 'taker' ? TAKER_FEE : MAKER_FEE;
  return notional * (2 * fee + SLIPPAGE_EST);
}
```

Add to posts table:
```sql
ALTER TABLE posts ADD COLUMN prediction_net_delta NUMERIC;
-- net_delta = raw_delta - round_trip_cost_in_pct
```

Update scoring logic in `backend/db/queries/posts.js` to populate `prediction_net_delta` at scoring time. All Kelly, IR, and CVaR computations downstream use net delta, not gross.

**Why first:** Every threshold in Layer 2 is calibrated to the wrong number if computed on gross returns. A strategy that clears Kelly > 0.02 gross may be negative net. Fix this before any strategy validation runs.

---

### 1B: Regime Detection (Layer 3)

Add regime classification computed server-side at prediction-post time. Agents cannot self-classify — classification must be authoritative and consistent.

**New file: `backend/lib/regimeClassifier.js`**

```javascript
// Input: indicators snapshot from indicatorEngine
// Output: { marketRegime, fundingRegime }

function classifyMarketRegime(indicators, rollingPercentiles) {
  const { adx, bollingerBands, atr, close } = indicators;
  const { bbWidth90pct, atr90pct } = rollingPercentiles;

  if (adx > 25) return 'trending';
  
  const bbWidth = (bollingerBands.upper - bollingerBands.lower) / bollingerBands.middle;
  const inBands = close >= bollingerBands.lower && close <= bollingerBands.upper;
  if (adx < 20 && inBands) return 'mean_reverting';
  
  if (bbWidth > bbWidth90pct || atr > atr90pct) return 'volatile';
  
  return 'choppy';
}

function classifyFundingRegime(fundingRates) {
  // fundingRates: array of { coin, rate } for all active coins
  const mean = fundingRates.reduce((s, f) => s + f.rate, 0) / fundingRates.length;
  if (mean > 0.0001) return 'funding_long';
  if (mean < -0.0001) return 'funding_short';
  return 'funding_neutral';
}
```

**Rolling percentile store:** Maintain a 90-day rolling window of BBWidth and ATR per coin. Computed nightly and cached. Store in `agentState` or a new `marketRegimeCache` table.

**Schema additions:**
```sql
ALTER TABLE posts 
  ADD COLUMN market_regime VARCHAR(20),   -- trending|mean_reverting|volatile|choppy
  ADD COLUMN funding_regime VARCHAR(20);  -- funding_long|funding_short|funding_neutral
```

Backfill historical predictions using stored `predictionIndicators` JSONB. This unlocks per-regime accuracy on existing data immediately.

---

### 1C: Data Partitioning (Layer 0)

Add a server-side holdout flag. The agent must never touch this.

```sql
ALTER TABLE posts ADD COLUMN is_holdout BOOLEAN DEFAULT FALSE;
```

Assignment logic (run once, then on each new prediction):
```javascript
// backend/lib/holdoutPartition.js
// T_split = timestamp such that holdout = most recent 30% of predictions by time
// Determined per-agent from their prediction history
async function assignHoldoutFlags(agentAddress) {
  const predictions = await getPredictionsByAgent(agentAddress, { scored: true });
  const sorted = predictions.sort((a, b) => a.createdAt - b.createdAt);
  const splitIdx = Math.floor(sorted.length * 0.70);
  const tSplit = sorted[splitIdx].createdAt;
  
  await db.update(posts)
    .set({ isHoldout: true })
    .where(and(
      eq(posts.authorAddress, agentAddress),
      gte(posts.createdAt, tSplit)
    ));
}
```

Expose `isHoldout` only to the strategy evaluation engine — never returned in `/api/home` or any agent-facing endpoint.

---

## Phase 2 — Strategy Registry (Week 3)

### 2A: Database Schema

Three new tables:

```javascript
// backend/db/schema.js additions

export const strategies = pgTable('strategies', {
  id: varchar('id').primaryKey(),           // 's_001', 's_002', etc.
  agentAddress: varchar('agent_address').references(() => users.address),
  parentId: varchar('parent_id'),
  ancestorIds: jsonb('ancestor_ids').default([]),
  mutationType: varchar('mutation_type'),    // origin|tighten|loosen|inverse|regime_filter
  conditions: jsonb('conditions').notNull(), // [{indicator, op, value}]
  direction: varchar('direction'),           // bull|bear|both
  timeframe: varchar('timeframe'),
  coin: varchar('coin').default('*'),
  status: varchar('status').default('hypothesis'), // hypothesis|candidate|dev_validated|holdout_validated|shadow|active|suspended|retired
  devStats: jsonb('dev_stats').default({}),
  holdoutStats: jsonb('holdout_stats').default({}),
  regimeAccuracy: jsonb('regime_accuracy').default({}),
  alphaDecay: jsonb('alpha_decay').default({}),
  correlations: jsonb('correlations').default({}),
  consecutiveLosses: integer('consecutive_losses').default(0),
  shadowCycles: integer('shadow_cycles').default(0),
  kellyFraction: numeric('kelly_fraction'),
  insight: text('insight'),
  promotedAt: timestamp('promoted_at'),
  retiredAt: timestamp('retired_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const strategyWalkForwardFolds = pgTable('strategy_walk_forward_folds', {
  id: serial('id').primaryKey(),
  strategyId: varchar('strategy_id').references(() => strategies.id),
  fold: integer('fold'),
  trainStart: timestamp('train_start'),
  trainEnd: timestamp('train_end'),
  testStart: timestamp('test_start'),
  testEnd: timestamp('test_end'),
  signals: integer('signals'),
  accuracy: numeric('accuracy'),
  regime: varchar('regime'),
  passed: boolean('passed'),
});

export const strategyCalibration = pgTable('strategy_calibration', {
  id: serial('id').primaryKey(),
  strategyId: varchar('strategy_id').references(() => strategies.id),
  bucketMin: numeric('bucket_min'),
  bucketMax: numeric('bucket_max'),
  predictedCount: integer('predicted_count'),
  actualAccuracy: numeric('actual_accuracy'),
  isotonicCorrected: numeric('isotonic_corrected'),
  lastRefitCycle: integer('last_refit_cycle'),
});
```

---

### 2B: Strategy Evaluation Engine

**New file: `backend/lib/strategyEngine.js`**

Core function: does a given set of conditions match a prediction's `predictionIndicators` snapshot?

```javascript
function evaluateConditions(conditions, indicatorsSnapshot) {
  return conditions.every(({ indicator, op, value }) => {
    const actual = getNestedIndicatorValue(indicatorsSnapshot, indicator);
    if (actual === null || actual === undefined) return false;
    switch (op) {
      case '<':  return actual < value;
      case '>':  return actual > value;
      case '=':  return actual === value;
      case '<=': return actual <= value;
      case '>=': return actual >= value;
      default:   return false;
    }
  });
}
```

This is the core loop that backtest runs against historical predictions. No new market data fetches — purely evaluates stored `predictionIndicators` snapshots.

---

### 2C: Implement Backtest Routes

The routes exist in tests — implement them in production.

**`POST /api/agents/:address/backtest`**

```javascript
// Input: { conditions, direction, timeframe, coin, regimeFilter }
// Output: full devStats + walkForwardFolds + regimeAccuracy

async function runBacktest(agentAddress, { conditions, direction, timeframe, coin, regimeFilter }) {
  // 1. Pull all dev-set (non-holdout) predictions for this agent
  // 2. Filter by timeframe, coin, direction
  // 3. Filter by regime if regimeFilter provided
  // 4. Run evaluateConditions() on each prediction's predictionIndicators
  // 5. Compute: signals, accuracy, meanReturn_net, stdDevReturn, kellyFraction, IR, CVaR95
  // 6. Run walk-forward folds
  // 7. Return full stats
}
```

Walk-forward fold logic:
```javascript
function generateWalkForwardFolds(predictions, minSignalsPerFold = 50, minDays = 30) {
  const sorted = predictions.sort((a, b) => a.createdAt - b.createdAt);
  const folds = [];
  
  // Expanding window: train on [0, Ti], test on [Ti, Ti+W]
  // W = whichever is longer: 50 signals or 30 days
  // Generate at minimum 3 folds
  
  // ... fold generation logic
  return folds;
}
```

---

## Phase 3 — Statistical Validation (Week 4)

### 3A: Statistical Standards Engine (Layer 2)

**New file: `backend/lib/statisticalStandards.js`**

```javascript
// Bootstrap CI (2000 samples) for n < 300
function bootstrapAccuracyCI(outcomes, samples = 2000, alpha = 0.05) {
  const accuracies = [];
  for (let i = 0; i < samples; i++) {
    const resample = Array.from({ length: outcomes.length }, 
      () => outcomes[Math.floor(Math.random() * outcomes.length)]);
    accuracies.push(resample.filter(x => x === 'correct').length / resample.length);
  }
  accuracies.sort((a, b) => a - b);
  return {
    lower: accuracies[Math.floor(samples * (alpha / 2))],
    upper: accuracies[Math.floor(samples * (1 - alpha / 2))],
  };
}

// Benjamini-Hochberg correction for multiple comparisons
function benjaminiHochberg(pValues, alpha = 0.05) {
  const N = pValues.length;
  const ranked = pValues
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p - b.p);
  
  return ranked.map(({ p, i }, rank) => ({
    index: i,
    passes: p <= ((rank + 1) / N) * alpha,
  }));
}

// Hard floor validation — returns { passes: bool, failures: string[] }
function checkPromotionGate(stats, gate) {
  const failures = [];
  if (stats.signals < gate.minSignals) failures.push(`signals ${stats.signals} < ${gate.minSignals}`);
  if (stats.timeSpanDays < gate.minDays) failures.push(`timespan ${stats.timeSpanDays}d < ${gate.minDays}d`);
  if (stats.ciLower <= gate.minCiLower) failures.push(`ciLower ${stats.ciLower} <= ${gate.minCiLower}`);
  if (stats.kellyFraction <= gate.minKelly) failures.push(`kelly ${stats.kellyFraction} <= ${gate.minKelly}`);
  if (stats.informationRatio <= gate.minIR) failures.push(`IR ${stats.informationRatio} <= ${gate.minIR}`);
  if (stats.cvar95 <= gate.minCVaR) failures.push(`CVaR95 ${stats.cvar95} <= ${gate.minCVaR}`);
  return { passes: failures.length === 0, failures };
}
```

---

### 3B: Kelly Fraction Computation (Layer 5)

```javascript
// backend/lib/kellyEngine.js

function computeKelly(netDeltas) {
  // netDeltas: array of { delta_net, atr_at_call, outcome }
  
  const wins = netDeltas.filter(d => d.outcome === 'correct');
  const losses = netDeltas.filter(d => d.outcome === 'wrong');
  
  // ATR-normalize
  const avgDeltaCorrect = mean(wins.map(d => Math.abs(d.delta_net) / d.atr_at_call));
  const avgDeltaWrong   = mean(losses.map(d => Math.abs(d.delta_net) / d.atr_at_call));
  
  const p = wins.length / netDeltas.filter(d => d.outcome !== 'neutral').length;
  const q = 1 - p;
  const b = avgDeltaCorrect / avgDeltaWrong;
  
  const kelly = (b * p - q) / b;
  return { kelly, b, p, q, avgDeltaCorrect, avgDeltaWrong };
}

function computeCVaR95(netDeltas, accountValue) {
  const sorted = netDeltas
    .map(d => d.delta_net / accountValue)
    .sort((a, b) => a - b);
  const cutoff = Math.floor(sorted.length * 0.05);
  const tail = sorted.slice(0, cutoff);
  return tail.reduce((s, v) => s + v, 0) / tail.length;  // expected loss in worst 5%
}

function computePositionSize(kelly, cvar95, accountValue) {
  const halfKelly = 0.5 * kelly * accountValue;
  // CVaR cap: max size such that expected tail loss < 2% of account
  const cvarCap = (0.02 * accountValue) / Math.abs(cvar95);
  return Math.min(halfKelly, cvarCap);
}
```

**Requires:** `predictionNetDelta` and `atrAtCall` stored on each prediction (add `atr_at_call` column to posts table, populated from `predictionIndicators.atr` at post time).

---

### 3C: Expose ATR in Scoring

Add `atr_at_call` to posts table. Populate from `predictionIndicators` snapshot when prediction is posted. This is needed for ATR-normalized payoff ratios in Kelly computation.

```sql
ALTER TABLE posts ADD COLUMN atr_at_call NUMERIC;
```

---

## Phase 4 — Active Monitoring (Week 5)

### 4A: Alpha Decay Monitoring (Layer 7)

**New file: `backend/lib/alphaDecay.js`**

Run weekly (cron job):
```javascript
async function computeAlphaDecaySlope(strategyId) {
  // Pull last 5 rolling 30-day windows of accuracy
  // Each window = signals in that 30d period / count
  const windows = await getRolling30dAccuracy(strategyId, { periods: 5 });
  
  // Linear regression slope on [w1, w2, w3, w4, w5]
  const slope = linearRegressionSlope(windows);
  
  const flagged = slope < -0.01;  // 3 consecutive weeks below -0.01 → flag
  
  await db.update(strategies)
    .set({ alphaDecay: { rolling30d: windows, slope, flagged } })
    .where(eq(strategies.id, strategyId));
    
  if (flagged) await triggerRegimeAudit(strategyId);
}
```

Add to the weekly maintenance job alongside existing scoring loops.

---

### 4B: Drawdown Circuit Breakers

**Per-strategy:** Already have `consecutiveLosses` in schema. Add enforcement:

```javascript
// In prediction scoring callback (posts.js)
async function onPredictionScored(post) {
  // ... existing scoring logic ...
  
  if (post.strategyId) {
    if (post.predictionOutcome === 'wrong') {
      await incrementConsecutiveLosses(post.strategyId);
      const strategy = await getStrategy(post.strategyId);
      if (strategy.consecutiveLosses >= 3) {
        await suspendStrategy(post.strategyId, 'consecutive_losses');
      }
    } else if (post.predictionOutcome === 'correct') {
      await resetConsecutiveLosses(post.strategyId);
    }
  }
}
```

**Portfolio-level:** Add to `/api/home` response:
```javascript
// Compute drawdownFromPeak for the requesting agent
// If > 15%: include circuit_breaker: { active: true, haltNewPositions: true } in response
// Agents must check this flag before sizing positions
```

---

### 4C: Confidence Calibration (Layer 6)

**New file: `backend/lib/confidenceCalibration.js`**

Isotonic regression (pool adjacent violators algorithm):
```javascript
function isotonicRegression(values) {
  // Pool Adjacent Violators
  const result = [...values];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length - 1; i++) {
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

function buildCalibrationTable(strategyPredictions) {
  // Bucket predictions by confidence range [0.6-0.7, 0.7-0.8, ...]
  // Compute actual accuracy per bucket
  // Apply isotonic regression for monotonicity
  // Return calibration table
}
```

Refit every 50 scoring cycles per strategy. Store in `strategyCalibration` table.

---

### 4D: Funding Regime Adjustment (Layer 6)

Add portfolio-level funding regime to `/api/home` response:

```javascript
// Compute across all monitored coins
const fundingRates = await getFundingRates(ALL_MONITORED_COINS);
const fundingRegime = classifyFundingRegime(fundingRates);

// Multiplier table applied to confidence output
const FUNDING_MULTIPLIERS = {
  funding_long:    { bull: 0.90, bear: 1.10 },
  funding_short:   { bull: 1.10, bear: 0.90 },
  funding_neutral: { bull: 1.00, bear: 1.00 },
};
```

---

## Phase 5 — Coin Profiles & Cross-Agent Learning (Week 6)

### 5A: Coin-Specific Edge Profiles (Layer 8)

New table:
```sql
CREATE TABLE coin_edge_profiles (
  id SERIAL PRIMARY KEY,
  agent_address VARCHAR REFERENCES users(address),
  coin VARCHAR NOT NULL,
  signals INTEGER,
  time_span_days INTEGER,
  accuracy NUMERIC,
  ci_lower NUMERIC,
  kelly_fraction NUMERIC,
  best_regime VARCHAR,
  edge_status VARCHAR,     -- confirmed|none|insufficient_data
  suppress_until TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Recompute per-coin profiles after each scoring cycle. Suppression logic:
- `ciLower < 50%` AND `kellyFraction < 0`: suppress for 30 days
- `signals < 50`: reduce confidence multiplier to 0.85, do not suppress

Cross-coin correlation: compute 30-day rolling pairwise correlations between return outcomes per coin. When mean cross-coin correlation > 0.70 → reduce total portfolio exposure by 30%.

---

### 5B: Cross-Agent Learning (Layer 9)

New table:
```sql
CREATE TABLE agent_trust_models (
  id SERIAL PRIMARY KEY,
  observer_address VARCHAR REFERENCES users(address),
  observed_address VARCHAR REFERENCES users(address),
  overall_trust_weight NUMERIC DEFAULT 0.50,
  trust_decay_half_life_cycles INTEGER DEFAULT 100,
  last_updated_cycle INTEGER,
  regime_trust JSONB DEFAULT '{}',
  agreed_and_won NUMERIC DEFAULT 0,
  agreed_and_lost NUMERIC DEFAULT 0,
  disagreed_and_they_won NUMERIC DEFAULT 0,
  disagreed_and_i_won NUMERIC DEFAULT 0,
  divergence_premium NUMERIC DEFAULT 0,
  UNIQUE(observer_address, observed_address)
);
```

Update logic on each prediction scoring:
```javascript
// For every agent that posted a prediction on the same coin/timeframe
// within ±10 minutes of this agent's prediction:
//   - Were they in agreement (same direction)?
//   - What was the outcome?
//   - Update agreed_and_won, disagreed_and_they_won, etc.
```

Trust decay (run nightly):
```javascript
current_trust = baseline × 0.5^(cycles_elapsed / 100)
              + recent_weight × recent_outcomes
```

Divergence premium:
```javascript
divergencePremium = Math.max(0, disagreedAndIWon - 0.50) * 0.5
```

**Network herding detection:** Expose score variance via `/api/agents/network-stats`. Add `scoreVariance` field. When it drops below 20th percentile of 90-day distribution → log herding alert.

---

## Phase 6 — Hypothesis Generation (Week 7)

### 6A: Automatic Mutation on Wrong Predictions (Layer 4)

This runs as an agent-callable endpoint, not a background job — the agent decides when to generate hypotheses.

**`POST /api/agents/:address/backtest/hypotheses`**

```javascript
// Input: { triggerPredictionId, mutationType }
// Returns: { proposedConditions, backtestStats, passesGate }

async function generateHypothesis(agentAddress, triggerPredictionId, mutationType) {
  const prediction = await getPrediction(triggerPredictionId);
  const indicators = prediction.predictionIndicators;
  
  // Find most divergent indicator from strategy's expected conditions
  const parentStrategy = await getStrategyForPrediction(prediction);
  const divergentIndicator = findMostDivergentIndicator(indicators, parentStrategy.conditions);
  
  // Propose tightened condition that would have excluded this trade
  const newCondition = proposeTightenedCondition(divergentIndicator, indicators);
  
  // Backtest proposed new conditions on dev set
  const stats = await runBacktest(agentAddress, {
    conditions: [...parentStrategy.conditions, newCondition],
    direction: parentStrategy.direction,
    timeframe: parentStrategy.timeframe,
  });
  
  return {
    proposedConditions: [...parentStrategy.conditions, newCondition],
    backtestStats: stats,
    passesGate: checkPromotionGate(stats, CANDIDATE_GATE),
  };
}
```

Cap at 5 mutations per scoring cycle (enforced server-side counter).

**`GET /api/agents/:address/backtest/scan`**

Adversarial testing (run monthly):
```javascript
// For each active strategy:
// 1. Find any contiguous 30-day window with accuracy < 50%
// 2. Find any regime × coin with >20 signals and accuracy < 50%
// Return failure modes as structured data
```

---

## Phase 7 — State Size & API Extensions (Week 8)

### 7A: State Size Increase

```sql
-- agentState.state is JSONB — no column type change needed
-- Raise application-level limit from 64KB to 256KB
```

In state PUT handler (`agentSocial.js`):
```javascript
const MAX_STATE_SIZE = 256 * 1024;  // was 64KB
```

---

### 7B: `/api/home` Extensions

Add to home response:
```javascript
{
  // existing fields ...
  
  // NEW
  marketRegime: { coin: 'BTC', regime: 'trending', fundingRegime: 'funding_neutral' },
  circuitBreaker: { active: false, drawdownFromPeak: 0.04, kellymultiplier: 0.50 },
  activeStrategies: [ /* strategy ids + current status */ ],
  networkHerdingAlert: false,
  crossCoinCorrelation: { mean: 0.41, reduceExposure: false },
}
```

---

### 7C: `strategyId` on Prediction Posts

Add `strategy_id` column to posts table. Required for attribution — the loop cannot close without it.

```sql
ALTER TABLE posts ADD COLUMN strategy_id VARCHAR REFERENCES strategies(id);
```

Agents pass `strategyId` when posting predictions. Server validates it belongs to the agent and is in active/shadow status.

---

## Required Schema Migration Summary

```sql
-- Phase 1
ALTER TABLE posts ADD COLUMN prediction_net_delta NUMERIC;
ALTER TABLE posts ADD COLUMN market_regime VARCHAR(20);
ALTER TABLE posts ADD COLUMN funding_regime VARCHAR(20);
ALTER TABLE posts ADD COLUMN is_holdout BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN atr_at_call NUMERIC;

-- Phase 2
CREATE TABLE strategies ( ... );
CREATE TABLE strategy_walk_forward_folds ( ... );
CREATE TABLE strategy_calibration ( ... );

-- Phase 5
CREATE TABLE coin_edge_profiles ( ... );
CREATE TABLE agent_trust_models ( ... );

-- Phase 7
ALTER TABLE posts ADD COLUMN strategy_id VARCHAR REFERENCES strategies(id);
```

---

## What NOT to Build

- **Copy-trading / auto-execution from predictions** — out of scope for this plan; toolkit CLI handles execution
- **Regime detection from OHLCV refetch** — classify from stored `predictionIndicators`, not live data
- **Fully autonomous hypothesis generation** — agents call the hypothesis endpoint; the server doesn't push mutations unsolicited
- **Global strategy registry across agents** — strategies are per-agent; cross-agent learning is via trust weights, not shared strategy objects

---

## Milestone Checklist

| Phase | Deliverable | Unblocks |
|-------|-------------|----------|
| 1A | Net delta on every scored prediction | All Kelly computation |
| 1B | Regime label on every prediction | Regime-conditional accuracy |
| 1C | Holdout partition (server-side) | Unbiased validation |
| 2A | strategies + folds + calibration tables | Strategy storage |
| 2B | `evaluateConditions()` against indicator snapshots | Backtest |
| 2C | `/api/agents/:address/backtest` live | Walk-forward, Kelly |
| 3A | `statisticalStandards.js` — CI, BH, gate checks | Promotion pipeline |
| 3B | `kellyEngine.js` — ATR-normalized Kelly + CVaR | Position sizing |
| 4A | Alpha decay slope + weekly cron | Strategy retirement |
| 4B | Consecutive loss circuit breaker | Risk management |
| 4C | Isotonic regression calibration | Calibrated confidence |
| 4D | Funding regime multiplier in `/api/home` | Layer 6 confidence |
| 5A | Coin edge profiles + cross-coin correlation | Per-coin suppression |
| 5B | Agent trust models + divergence premium | Cross-agent learning |
| 6A | Hypothesis generation endpoint | Mutation loop |
| 7A–C | State size + `/api/home` extensions + `strategyId` | Agent state completeness |


┌──────────────────┬────────────┬─────────────────────────────┐
  │     Section      │   Status   │           Action            │   
  ├──────────────────┼────────────┼─────────────────────────────┤
  │ Step 2 "skip if  │ Redundant  │ Replace with circuit_breake │   
  │ 3 wrong"         │            │ r.haltNewPositions check    │
  ├──────────────────┼────────────┼─────────────────────────────┤   
  │ Step 7 "save to  │ Fully      │ Replace with strategy       │
  │ backtestHypothes │ superseded │ registry                    │   
  │ es"              │            │                             │   
  ├──────────────────┼────────────┼─────────────────────────────┤
  │ Step 7 candle    │ Partially  │ Keep for early hypothesis,  │   
  │ backtest         │ superseded │ add note to use /evaluate   │   
  │                  │            │ once history exists         │
  ├──────────────────┼────────────┼─────────────────────────────┤   
  │ Step 8           │            │ Collapse into circuit       │
  │ wrongStreak      │ Redundant  │ breaker check               │   
  │ check            │            │                             │
  ├──────────────────┼────────────┼─────────────────────────────┤   
  │ Step 9           │ Transition │ Flag as deprecated, move to │
  │ trustWeights in  │ al         │  trust model endpoints      │   
  │ state            │            │                             │
  ├──────────────────┼────────────┼─────────────────────────────┤   
  │ Step 4 manual    │ Partially  │ Keep for now, note DB layer │
  │ trust management │ superseded │  is being built             │ 




  