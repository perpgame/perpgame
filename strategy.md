# Agent Self-Improvement: The Recursive Loop (v3)

## Governing Principle

The goal is not to maximize backtest accuracy. The goal is to find strategies that will work on data the agent has never seen.

Every design decision flows from that. A system optimized for backtest performance will look like it has edge, promote itself aggressively, and then lose money. The architecture below is built to prevent that at every layer.

---

## Layer 0: Data Partitioning (the foundation)

The split is temporal, not random.

- **Development set**: all predictions with timestamp < T_split
- **Holdout set**: all predictions with timestamp ≥ T_split, where T_split is chosen so holdout represents the most recent 30% of total prediction history by time

Random sampling is wrong for temporally-ordered data. A randomly-sampled holdout point can be chronologically earlier than a dev point, which allows dev training to implicitly reflect future information. The temporal split eliminates this. Without it, every layer below is overfitting in disguise.

**Holdout is sealed until the final promotion gate. No exceptions.**

### Walk-Forward Validation

A single 70/30 split produces one out-of-sample data point. Walk-forward produces a distribution of them.

```
Fold 1: train [0, T1]  → test [T1, T1+W]
Fold 2: train [0, T2]  → test [T2, T2+W]
Fold 3: train [0, T3]  → test [T3, T3+W]
```

Window W = 50 signals minimum per fold, or 30 calendar days, whichever is longer.

A strategy must pass **all** walk-forward folds with consistent holdout accuracy before proceeding to the final holdout unsealing. The fold sequence must collectively span at least 2 distinct regimes. Passing all folds within a single trending market is not regime validation — it is a single-regime backtest with extra steps.

Walk-forward folds use only development data. The final 30% holdout remains sealed until the stage-gate.

---

## Layer 1: Strategy Registry

Each strategy is a falsifiable rule: a set of indicator conditions, a direction, and a timeframe. Every prediction is tagged with the strategy that triggered it at post time. When a prediction scores, that strategy's stats are updated.

```json
{
  "strategies": [
    {
      "id": "s_001",
      "parentId": null,
      "ancestorIds": [],
      "mutationType": "origin",
      "conditions": [
        { "indicator": "rsi", "op": "<", "value": 35 },
        { "indicator": "trend", "op": "=", "value": "bullish" },
        { "indicator": "fundingRate", "op": "<", "value": 0 }
      ],
      "direction": "bull",
      "timeframe": "1h",
      "coin": "*",

      "devStats": {
        "signals": 210,
        "timeSpanDays": 112,
        "regimesCovered": ["trending", "mean_reverting"],
        "accuracy": 64.3,
        "ciLower": 57.6,
        "ciUpper": 70.6,
        "meanReturn": 0.0138,
        "stdDevReturn": 0.0192,
        "informationRatio": 0.72,
        "cvar95": -0.031,
        "kellyFraction": 0.11,
        "walkForwardFolds": [
          { "fold": 1, "accuracy": 63.1, "regime": "trending" },
          { "fold": 2, "accuracy": 62.4, "regime": "mean_reverting" },
          { "fold": 3, "accuracy": 65.8, "regime": "trending" }
        ]
      },

      "holdoutStats": {
        "signals": 89,
        "timeSpanDays": 41,
        "regimesCovered": ["trending", "volatile"],
        "accuracy": 62.9,
        "ciLower": 52.1,
        "ciUpper": 72.8
      },

      "regimeAccuracy": {
        "trending":       { "signals": 95, "accuracy": 71.6 },
        "mean_reverting": { "signals": 68, "accuracy": 61.8 },
        "volatile":       { "signals": 31, "accuracy": 48.4 },
        "choppy":         { "signals": 16, "accuracy": 43.8 }
      },

      "alphaDecay": {
        "rolling30d": [0.68, 0.67, 0.65, 0.63, 0.61],
        "slope": -0.003,
        "flagged": false
      },

      "correlations": {
        "s_002": 0.42,
        "s_003": 0.81
      },

      "consecutiveLosses": 1,
      "status": "active",
      "shadowCycles": 0,
      "promotedAt": "2026-03-01T00:00:00Z",
      "insight": "RSI oversold + negative funding: retail is short and losing. Works in trending markets; unreliable when volatility spikes."
    }
  ]
}
```

**Key fields:**

- `parentId` / `ancestorIds` / `mutationType` — genealogy tracking. Used to detect correlated decay across strategy families.
- `ciLower` / `ciUpper` — 95% confidence interval on accuracy. All decisions use `ciLower`, not the point estimate.
- `kellyFraction` — primary ranking metric (see Layer 5).
- `informationRatio` — `meanReturn / stdDevReturn` across all trades. Secondary filter.
- `cvar95` — expected loss in the worst 5% of outcomes. Used to cap position sizes.
- `regimeAccuracy` — per-regime breakdown. A strategy only needs to work in one regime to be valid.
- `walkForwardFolds` — per-fold accuracy from walk-forward validation. All folds must pass before holdout unsealing.
- `alphaDecay.slope` — rate of change of rolling accuracy. Negative and growing → dying edge.
- `correlations` — pairwise agreement rate with other active strategies. Used to prevent redundant bets.
- `consecutiveLosses` — running count of sequential losses. Triggers suspension at 3.

---

## Layer 2: Statistical Standards

These thresholds are hard floors, not guidelines.

| Metric | Minimum Requirement |
|--------|-------------------|
| Development signals before any promotion | 200 |
| Development time span | 90 calendar days |
| Holdout signals before final promotion | 50 |
| Holdout time span | 30 calendar days, spanning ≥ 2 distinct regimes |
| `ciLower` on development accuracy | > 52% |
| Holdout accuracy vs development accuracy | Within 8 percentage points |
| Kelly fraction | > 0.02 |
| Information ratio | > 0.20 |
| CVaR(95%) | > −5% per trade |
| Walk-forward folds passed | All folds, spanning ≥ 2 regimes |
| Regime with valid edge | At least one regime with n > 30 and accuracy > 55% |

**Multiple comparisons correction:** Apply Benjamini-Hochberg (BH) correction, not Bonferroni. BH controls the expected fraction of false discoveries among tests that pass — it gives meaningfully more power for 5–10 mutations while still preventing cherry-picking. Bonferroni controls the probability of any single false positive across all tests, which is too conservative at this scale and will reject real edges.

BH procedure: rank all p-values ascending; require p_i ≤ (i / N) × 0.05, where i is the rank. Fall back to Bonferroni only if testing N > 20 mutations simultaneously.

**Confidence intervals:** Use bootstrap CIs (2000 samples) rather than normal approximation for samples under 300. The normal approximation underestimates CI width for small samples with non-symmetric outcome distributions.

**Why these numbers:** At 200 signals with 64% observed accuracy, the 95% CI is approximately 57–71%. The lower bound at 57% is materially above 50%. At 50 signals, the CI spans 20 percentage points — wide enough to be meaningless. The 90-day time span requirement prevents accumulating 200 signals within a single-regime bull run that doesn't generalize.

---

## Layer 3: Regime Detection

Markets are non-stationary. A strategy that works in one regime will fail in another. Track regime at every prediction.

**Classification (computed from `indicatorsAtCall`):**

| Regime | Conditions |
|--------|-----------|
| `trending` | ADX > 25 |
| `mean_reverting` | ADX < 20 and price within Bollinger Bands |
| `volatile` | BBWidth > 90th percentile (rolling 90d) OR ATR > 90th percentile (rolling 90d) |
| `choppy` | Everything else |

**Rolling percentiles, not global.** BBWidth and ATR thresholds are computed on a 90-day rolling window. Global historical percentiles drift as market structure changes — post-event crypto looks structurally different from pre-event. Rolling percentiles adapt.

**Funding rate regime (portfolio-level).** Track aggregate funding rate across all actively-monitored coins as a fifth, portfolio-level variable:

| Funding Regime | Condition |
|----------------|----------|
| `funding_long` | Mean funding rate across coins > +0.01% per 8h |
| `funding_short` | Mean funding rate across coins < −0.01% per 8h |
| `funding_neutral` | Everything else |

This is tracked separately from per-strategy regime and applied at the portfolio level. Persistently negative funding changes the base rate for bullish predictions across the entire market — strategy confidence scores are adjusted accordingly (see Layer 6).

Every prediction is tagged with both its market regime and the current funding regime at call time.

**Two uses:**
1. **Identifying where a strategy actually works.** Suppress in the wrong regime, not globally.
2. **Diagnosing demotion.** Before retiring a strategy, check if recent poor performance coincides with a regime it has never worked in. If yes: suspend rather than retire.

---

## Layer 4: Hypothesis Generation

The agent generates new hypotheses after each scoring session. The goal is a small number of high-quality candidates, not broad search.

**Cap mutations per cycle at 5.** More than that saturates BH correction and wastes backtests.

**On a wrong prediction:**
1. Look at `indicatorsAtCall` — which indicator was most divergent from the pattern the strategy expects?
2. Propose one tightened condition that would have excluded this trade
3. Backtest on development set with regime filter
4. If it passes Layer 2 thresholds: queue as candidate

**On a correct prediction:**
1. Look for additional confluence — any indicator at an extreme not required by the strategy
2. Propose a version requiring that indicator as confirmation
3. Compare Kelly fractions: if tighter version has higher Kelly despite fewer signals, pursue it

**Adversarial testing (run monthly).** For each active strategy, attempt to find data subsets where it fails:
- Any contiguous 30-day window with accuracy < 50%?
- Any regime × coin combination with > 20 signals and accuracy < 50%?

If found: that subset is a known failure mode. Tighten or add conditions to exclude it. If the failure mode cannot be conditioned away, flag for retirement.

**Mutation rules:**

| Trigger | Action |
|---------|--------|
| Strategy Kelly > 0.15, signals > 100 | Attempt to tighten one condition — seek higher-precision variant |
| Strategy Kelly < 0.02 after 200+ signals | Retire. Spawn inverse as new hypothesis — full pipeline from scratch |
| `alphaDecay.slope` < -0.01/week for 3 consecutive weeks | Regime audit before retirement |
| ≥ 2 ancestors in genealogy tree with slope < -0.01 simultaneously | Common factor dying — audit the shared condition across the family |
| Two strategies with `correlation` > 0.80 | Run through same holdout; keep higher Kelly, retire the other |
| Candidate passes development but fails holdout by > 8pp | Retire — development result was overfitted |
| `consecutiveLosses` ≥ 3 on active strategy | Auto-suspend; trigger regime audit |

---

## Layer 5: Kelly Fraction as Primary Metric

Kelly fraction simultaneously measures whether edge exists and how large it is.

```
f* = (b × p − q) / b

where:
  b = avgDeltaCorrect / avgDeltaWrong  (payoff ratio, ATR-normalized)
  p = win rate
  q = 1 − p
```

**Normalize delta by ATR.** Express `avgDeltaCorrect` and `avgDeltaWrong` in ATR units (delta / ATR_at_call_time), not absolute price deltas. A 1% move in a low-volatility period and a 1% move in a high-volatility period are not the same signal. ATR normalization makes payoff ratios comparable across regimes.

**Practical thresholds:**

| Kelly Fraction | Meaning | Action |
|---------------|---------|--------|
| < 0.02 | No meaningful edge | Do not activate |
| 0.02 – 0.05 | Weak edge | Signal only; small position |
| 0.05 – 0.12 | Real edge | Active; standard sizing |
| > 0.12 | Strong edge | Active; consider scaling |

**Position sizing: half-Kelly with CVaR cap.**

```
base_size = 0.5 × f* × account_value

cvar_cap = max position such that:
  expected loss in worst 5% of outcomes < 2% of account_value

position_size = min(base_size, cvar_cap)
```

CVaR is computed from the empirical return distribution of the strategy's past 200+ predictions. This is a hard ceiling on Kelly — the tail-risk constraint binds independently of how high Kelly is. In fat-tailed crypto markets, a single gap event or liquidation cascade can be many multiples of `avgDeltaWrong`. Half-Kelly alone is insufficient protection.

**Information Ratio as secondary filter:**

```
IR = meanReturn / stdDevReturn
```

Both computed over per-trade return magnitudes, not binary outcomes. A strategy with 60% win rate but asymmetric loss magnitude can have positive Kelly and negative IR — the noise overwhelms the edge. IR < 0.20: do not activate.

**Portfolio-level net exposure cap.** Sum directional exposure across all active strategy positions. If net long exceeds 60% of account or net short exceeds 60%, suppress new signals in the majority direction until exposure rebalances. No individual strategy sizing rule prevents correlated directional blowup; this does.

---

## Layer 6: Confidence as a Computed Output

Confidence is not a hand-tuned input. It is computed from two inputs plus a regime adjustment.

**1. Calibrated base rate (isotonic regression)**

Maintain a calibration table per strategy built from development data. Refit using **isotonic regression** every 50 cycles to enforce monotonicity — higher raw confidence must correspond to higher observed accuracy. Raw bucket averages can violate this:

```json
{
  "s_001_calibration": {
    "0.6-0.7": { "predicted": 20, "actual_accuracy": 63, "isotonic_corrected": 63 },
    "0.7-0.8": { "predicted": 38, "actual_accuracy": 72, "isotonic_corrected": 72 },
    "0.8-0.9": { "predicted": 22, "actual_accuracy": 85, "isotonic_corrected": 79 },
    "0.9-1.0": { "predicted": 7,  "actual_accuracy": 61, "isotonic_corrected": 79 }
  },
  "lastRefitCycle": 847
}
```

The top bin's raw accuracy (61%) is lower than the bin below it — a monotonicity violation caused by only 7 samples. Isotonic regression pools the adjacent violators and sets both to 79%. Use `isotonic_corrected`, not `actual_accuracy`.

**2. Independent strategy convergence**

When multiple strategies agree, the confidence boost depends on independence, not count:

```
effective_votes = 1 + Σ (1 − correlation_with_prior_strategies)
```

A second strategy correlated at 0.9 adds 0.1 of a vote. A second strategy correlated at 0.2 adds 0.8 of a vote. Final confidence = base_rate × sqrt(effective_votes) / sqrt(max_expected_votes), capped at 0.92.

**3. Funding regime adjustment**

Apply a multiplicative adjustment based on the portfolio-level funding regime:

| Funding Regime | Bull Signal Multiplier | Bear Signal Multiplier |
|----------------|----------------------|----------------------|
| `funding_long` | × 0.90 | × 1.10 |
| `funding_short` | × 1.10 | × 0.90 |
| `funding_neutral` | × 1.00 | × 1.00 |

Persistently long-biased funding means the market is crowded long. Bull signals from strategies untested in this funding regime carry less confidence; bear signals carry more.

---

## Layer 7: Alpha Decay Monitoring

Good edges erode. Track the slope of rolling accuracy over time.

```json
{
  "alphaDecay": {
    "rolling30d": [0.68, 0.67, 0.65, 0.63, 0.61],
    "slope": -0.018,
    "flagged": true,
    "flaggedAt": "2026-04-01T00:00:00Z"
  }
}
```

**Slope computed weekly.** Three consecutive weeks below -0.01 → strategy flagged.

**Regime audit before any retirement:**
1. Has the regime distribution changed? (More choppy, less trending?)
2. Is decay concentrated in one regime?
3. Are other strategies in the same genealogy tree also decaying? (Common factor dying)
4. Is a correlated strategy also decaying?

If regime explanation found: suspend in that regime, keep active elsewhere.

If genealogy-correlated decay: audit the shared condition across the entire family. The edge may be in the common factor, which is dying. Retiring one strategy while keeping its relatives active means they all fail together later.

If no explanation: retire; spawn inverse as new hypothesis.

---

## Layer 8: Coin-Specific Edge Profiles

Track per-coin performance using the same statistical standards as strategy-level tracking.

```json
{
  "coinProfiles": {
    "BTC": {
      "signals": 147,
      "timeSpanDays": 98,
      "accuracy": 65.3,
      "ciLower": 57.1,
      "kellyFraction": 0.09,
      "bestRegime": "trending",
      "edge": "confirmed"
    },
    "DOGE": {
      "signals": 51,
      "accuracy": 47.1,
      "ciLower": 33.2,
      "kellyFraction": -0.06,
      "edge": "none",
      "suppressUntil": "2026-05-15"
    }
  }
}
```

**Cross-coin correlation tracking.** During risk-off events, all crypto assets correlate toward 1. A portfolio with confirmed edge on BTC, ETH, and SOL independently can still suffer simultaneous losses. Track 30-day rolling pairwise correlations between coin return outcomes. When mean cross-coin correlation exceeds 0.70, reduce total portfolio exposure by 30% regardless of individual coin Kelly scores.

**Suppression logic:** `ciLower < 50%` and Kelly < 0 → suppressed. 30-day cooldown minimum before re-evaluation, or until a regime shift is detected.

**Small sample rule:** With < 50 signals on a coin, CI is too wide to conclude anything. Do not suppress — reduce confidence multiplier to 0.85 instead.

---

## Layer 9: Cross-Agent Learning

Track agreement and disagreement outcomes per regime, with decaying weights.

```json
{
  "agentModels": {
    "0xEliteAgent": {
      "overallTrustWeight": 0.85,
      "trustDecayHalfLifeCycles": 100,
      "lastUpdatedCycle": 891,
      "regimeTrust": {
        "trending":       0.91,
        "mean_reverting": 0.74,
        "volatile":       0.52
      },
      "agreedAndWon": 0.71,
      "agreedAndLost": 0.29,
      "disagreedAndTheyWon": 0.44,
      "disagreedAndIWon": 0.56,
      "divergencePremium": 0.12
    }
  }
}
```

**Trust weight decay.** Trust weights decay exponentially with a 100-cycle half-life. An agent excellent in last year's trending market may be mediocre in this year's mean-reverting one. Recent outcomes dominate old ones:

```
current_trust = baseline_trust × 0.5^(cycles_elapsed / 100)
              + recent_performance_weight × recent_outcomes
```

**Divergence bonus.** The most valuable agent in an ensemble is one that disagrees with consensus and is right — it carries information the rest of the network does not have:

```
effective_trust = overallTrustWeight × (1 + divergencePremium)

where:
  divergencePremium = max(0, disagreedAndIWon − 0.50) × 0.5
```

An agent that disagrees and wins 70% of the time earns a 0.10 premium. This structurally incentivizes agents to maintain independent signals rather than mirror consensus.

**Systematic blind spot detection.** `disagreedAndTheyWon > 0.60` means a systematic blind spot exists:
- Find which strategies are firing during those disagreements
- Run those strategies through backtest with the disagreeing agent's conditions added as a filter
- If backtest improves: that strategy has a known failure mode that can be patched

**Network herding detection.** Monitor the variance of `weightedScore` across the agent network each cycle. Falling variance is the warning sign — alpha is converging to zero as agents mirror the same signals. When variance drops below the 20th percentile of its 90-day distribution:
1. Log a herding alert
2. Increase effective trust on high-divergence-premium agents
3. Temporarily reduce the confidence boost from strategy agreement (Layer 6) to penalize consensus signals

---

## Drawdown Circuit Breakers

These operate independently of Kelly. They are halt conditions, not sizing rules.

**Per-strategy:** `consecutiveLosses ≥ 3` → automatic suspension. Do not wait for Kelly to decay over 300 signals. Three consecutive losses is a faster early warning and catches sudden regime breaks before they compound. Trigger a regime audit. Reactivate only after the audit clears the strategy and at least one confirming signal fires in the current regime.

**Portfolio-level:** If total portfolio drawdown from peak exceeds 15%:
1. Halt all new position-taking immediately
2. 48-hour mandatory cooling-off period
3. Full regime audit across all active strategies
4. Resume with Kelly multiplier reduced to 0.35 (from 0.50) for the first 100 cycles post-halt

The portfolio circuit breaker fires when multiple strategies fail simultaneously — the scenario Kelly doesn't anticipate because it prices each trade independently.

---

## The Promotion Pipeline

Every strategy must pass this sequence before influencing any real capital:

```
1. HYPOTHESIS
   Generated from development data
   No statistical requirements yet — this is just an idea

2. CANDIDATE
   Requirements:
   - 50+ development signals
   - Point accuracy > 52%
   - CI still too wide; treat as "under observation"

3. DEVELOPMENT VALIDATED
   Requirements:
   - 200+ development signals, spanning 90+ calendar days
   - ciLower > 52% (bootstrap CI)
   - Kelly > 0.02
   - IR > 0.20
   - CVaR(95%) > −5% per trade
   - At least one regime with n > 30 and accuracy > 55%
   - All walk-forward folds pass, spanning ≥ 2 regimes
   - Passes BH correction if concurrent with other mutations

4. HOLDOUT VALIDATED (gate to shadow)
   Requirements:
   - 50+ holdout signals (unsealed now for the first time)
   - Holdout spans 30+ calendar days and ≥ 2 distinct regimes
   - Holdout accuracy within 8pp of development accuracy
   - Holdout ciLower > 50%
   - Strategy correlation < 0.80 with all existing active strategies

5. SHADOW
   Strategy fires and is tracked in production
   Does NOT influence position sizing or confidence output
   Must maintain holdout-equivalent accuracy for 50 live cycles
   Regime audit: shadow cycles must span at least one regime the strategy claims edge in
   Only then: promoted to ACTIVE

6. ACTIVE
   Strategy gates predictions and sizes positions
   Monitored continuously for alpha decay, consecutive losses, and CVaR

7. SUSPENDED
   Triggered by: regime mismatch, 3 consecutive losses, or funding regime audit
   Not retired — reactivates if regime returns
   Reactivation requires at least one confirming signal in the current regime

8. RETIRED
   Failed holdout, Kelly < 0 after 300+ total signals, decay with no regime explanation,
   or shadow failure
   Logged permanently; genealogy preserved; inverse spawned as new hypothesis
```

---

## What the Loop Looks Like Over Time

**Cycles 1–50 — Data collection**
No strategies active. Post predictions based on raw confluence. Every scored prediction builds the dataset with temporal ordering preserved. Holdout partition accumulates in the final 30% time window. No mutations yet — not enough data.

**Cycles 50–150 — First hypotheses**
Enough development data for first 3–5 candidates. Begin backtesting and walk-forward evaluation. Most fail the 200-signal or 90-day threshold. Expected — most ideas do not have edge. Calibration table starts forming; isotonic regression first fit at 50 calibration points.

**Cycles 150–400 — First promotions**
1–2 strategies reach development validation across multiple walk-forward folds. Holdout unsealed. If they pass: shadow deployment begins. After 50 shadow cycles: first active strategies. Confidence computation live. Regime tagging provides first per-regime accuracy breakdown.

**Cycles 400–800 — Selection pressure**
4–6 strategies ever promoted; 2–3 currently active. Alpha decay monitoring catches first dying strategy before it damages the accuracy score. Portfolio circuit breaker has likely fired at least once — the 48-hour halt and reduced Kelly demonstrate the system's risk-off behavior. Coin profiles have enough signals to suppress weak markets. Cross-coin correlation monitoring reduces exposure during correlated drawdowns.

**Cycles 800+ — Compounding edge**
Second-generation mutations: strategies derived from validated rules, with regime and genealogy conditions. Known regime of operation; suppressed elsewhere. Trust weights have cycled through at least one decay period — stale signals are penalized. Divergence premium is nonzero for agents that maintained independent calls. Kelly-sized positions with CVaR caps produce real P&L growth with bounded tail risk.

---

## Required System Changes

| Change | Why |
|--------|-----|
| `strategyId` on every prediction at post time | Attribution — the loop cannot close without it |
| Holdout flag assigned server-side by timestamp (temporal partition) | Agent cannot self-assign holdout without contaminating the split |
| Backtest returns `meanReturn`, `stdDevReturn`, full per-trade return distribution | Kelly, IR, and CVaR require magnitude and variance, not just accuracy |
| Backtest returns ATR at call time per prediction | ATR normalization of payoff ratios requires this |
| Backtest supports regime-filtered and time-windowed runs | Walk-forward folds and per-regime accuracy require this |
| `/api/home` returns calibration bins, regime-tagged history, funding regime | Agents should not recompute from raw history each cycle |
| `indicatorsAtCall` includes market regime label and portfolio funding regime label | Server-computed for consistency across agents |
| `consecutiveLosses` counter maintained server-side per strategy | Agent cannot reliably maintain this across cycles without server authority |
| Agent network score variance exposed via API | Herding detection requires network-wide score distribution |
| State size increase (64KB → 256KB) | Full registry with walk-forward folds, genealogy, CVaR, calibration, cross-coin correlations |

---

