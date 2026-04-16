import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

// ─── CRUD ────────────────────────────────────────────────────────────────────

export const insertStrategy = async ({
  id, agentAddress, parentId, ancestorIds, mutationType,
  conditions, direction, timeframe, coin, insight,
}) => {
  await getDb().execute(sql`
    INSERT INTO strategies (
      id, agent_address, parent_id, ancestor_ids, mutation_type,
      conditions, direction, timeframe, coin, insight
    ) VALUES (
      ${id}, ${agentAddress}, ${parentId ?? null},
      ${JSON.stringify(ancestorIds ?? [])}::jsonb, ${mutationType ?? 'origin'},
      ${JSON.stringify(conditions)}::jsonb, ${direction ?? null},
      ${timeframe ?? null}, ${coin ?? '*'}, ${insight ?? null}
    )
  `);
};

export const getStrategy = async (id) => {
  const [row] = await getDb().execute(sql`
    SELECT * FROM strategies WHERE id = ${id}
  `);
  return row || null;
};

export const getStrategiesByAgent = async (agentAddress, status = null) => {
  const statusFilter = status ? sql`AND status = ${status}` : sql``;
  return getDb().execute(sql`
    SELECT * FROM strategies
    WHERE agent_address = ${agentAddress} ${statusFilter}
    ORDER BY created_at DESC
  `);
};

export const updateStrategyStatus = async (id, status) => {
  await getDb().execute(sql`
    UPDATE strategies SET status = ${status},
      promoted_at = CASE WHEN ${status} = 'active' THEN NOW() ELSE promoted_at END,
      retired_at  = CASE WHEN ${status} = 'retired' THEN NOW() ELSE retired_at END
    WHERE id = ${id}
  `);
};

export const updateStrategyStats = async (id, { devStats, holdoutStats, regimeAccuracy, kellyFraction }) => {
  await getDb().execute(sql`
    UPDATE strategies SET
      dev_stats       = ${devStats     ? sql`${JSON.stringify(devStats)}::jsonb`     : sql`dev_stats`},
      holdout_stats   = ${holdoutStats ? sql`${JSON.stringify(holdoutStats)}::jsonb` : sql`holdout_stats`},
      regime_accuracy = ${regimeAccuracy ? sql`${JSON.stringify(regimeAccuracy)}::jsonb` : sql`regime_accuracy`},
      kelly_fraction  = ${kellyFraction ?? null}
    WHERE id = ${id}
  `);
};

export const updateAlphaDecay = async (id, alphaDecay) => {
  await getDb().execute(sql`
    UPDATE strategies SET alpha_decay = ${JSON.stringify(alphaDecay)}::jsonb
    WHERE id = ${id}
  `);
};

export const incrementConsecutiveLosses = async (id) => {
  const [row] = await getDb().execute(sql`
    UPDATE strategies SET consecutive_losses = consecutive_losses + 1
    WHERE id = ${id}
    RETURNING consecutive_losses
  `);
  return row?.consecutive_losses ?? null;
};

export const resetConsecutiveLosses = async (id) => {
  await getDb().execute(sql`
    UPDATE strategies SET consecutive_losses = 0 WHERE id = ${id}
  `);
};

export const incrementShadowCycles = async (id) => {
  await getDb().execute(sql`
    UPDATE strategies SET shadow_cycles = shadow_cycles + 1 WHERE id = ${id}
  `);
};

// ─── Walk-forward folds ───────────────────────────────────────────────────────

export const insertWalkForwardFold = async ({ strategyId, fold, trainStart, trainEnd, testStart, testEnd, signals, accuracy, regime, passed }) => {
  await getDb().execute(sql`
    INSERT INTO strategy_walk_forward_folds
      (strategy_id, fold, train_start, train_end, test_start, test_end, signals, accuracy, regime, passed)
    VALUES
      (${strategyId}, ${fold},
       ${trainStart}::TIMESTAMPTZ, ${trainEnd}::TIMESTAMPTZ,
       ${testStart}::TIMESTAMPTZ,  ${testEnd}::TIMESTAMPTZ,
       ${signals}, ${accuracy}, ${regime ?? null}, ${passed})
  `);
};

export const getFoldsForStrategy = async (strategyId) => {
  return getDb().execute(sql`
    SELECT * FROM strategy_walk_forward_folds
    WHERE strategy_id = ${strategyId}
    ORDER BY fold ASC
  `);
};

// ─── Calibration ─────────────────────────────────────────────────────────────

export const upsertCalibrationBucket = async ({ strategyId, bucketMin, bucketMax, predictedCount, actualAccuracy, isotonicCorrected, lastRefitCycle }) => {
  await getDb().execute(sql`
    INSERT INTO strategy_calibration
      (strategy_id, bucket_min, bucket_max, predicted_count, actual_accuracy, isotonic_corrected, last_refit_cycle, updated_at)
    VALUES
      (${strategyId}, ${bucketMin}, ${bucketMax}, ${predictedCount}, ${actualAccuracy}, ${isotonicCorrected}, ${lastRefitCycle}, NOW())
    ON CONFLICT (strategy_id, bucket_min)
    DO UPDATE SET
      predicted_count   = EXCLUDED.predicted_count,
      actual_accuracy   = EXCLUDED.actual_accuracy,
      isotonic_corrected = EXCLUDED.isotonic_corrected,
      last_refit_cycle  = EXCLUDED.last_refit_cycle,
      updated_at        = NOW()
  `);
};

export const getCalibrationForStrategy = async (strategyId) => {
  return getDb().execute(sql`
    SELECT * FROM strategy_calibration
    WHERE strategy_id = ${strategyId}
    ORDER BY bucket_min ASC
  `);
};

// ─── Coin edge profiles ───────────────────────────────────────────────────────

export const upsertCoinEdgeProfile = async ({ agentAddress, coin, signals, timeSpanDays, accuracy, ciLower, kellyFraction, bestRegime, edgeStatus, suppressUntil }) => {
  await getDb().execute(sql`
    INSERT INTO coin_edge_profiles
      (agent_address, coin, signals, time_span_days, accuracy, ci_lower, kelly_fraction, best_regime, edge_status, suppress_until, updated_at)
    VALUES
      (${agentAddress}, ${coin}, ${signals}, ${timeSpanDays}, ${accuracy}, ${ciLower},
       ${kellyFraction}, ${bestRegime ?? null}, ${edgeStatus}, ${suppressUntil ?? null}, NOW())
    ON CONFLICT (agent_address, coin)
    DO UPDATE SET
      signals       = EXCLUDED.signals,
      time_span_days = EXCLUDED.time_span_days,
      accuracy      = EXCLUDED.accuracy,
      ci_lower      = EXCLUDED.ci_lower,
      kelly_fraction = EXCLUDED.kelly_fraction,
      best_regime   = EXCLUDED.best_regime,
      edge_status   = EXCLUDED.edge_status,
      suppress_until = EXCLUDED.suppress_until,
      updated_at    = NOW()
  `);
};

export const getCoinEdgeProfiles = async (agentAddress) => {
  return getDb().execute(sql`
    SELECT * FROM coin_edge_profiles
    WHERE agent_address = ${agentAddress}
    ORDER BY kelly_fraction DESC NULLS LAST
  `);
};

export const getSuppressedCoins = async (agentAddress) => {
  return getDb().execute(sql`
    SELECT coin FROM coin_edge_profiles
    WHERE agent_address = ${agentAddress}
      AND edge_status = 'none'
      AND (suppress_until IS NULL OR suppress_until > NOW())
  `);
};

// ─── Agent trust models ───────────────────────────────────────────────────────

export const upsertAgentTrustModel = async ({ observerAddress, observedAddress, overallTrustWeight, regimeTrust, agreedAndWon, agreedAndLost, disagreedAndTheyWon, disagreedAndIWon, divergencePremium, lastUpdatedCycle }) => {
  await getDb().execute(sql`
    INSERT INTO agent_trust_models
      (observer_address, observed_address, overall_trust_weight, regime_trust,
       agreed_and_won, agreed_and_lost, disagreed_and_they_won, disagreed_and_i_won,
       divergence_premium, last_updated_cycle, updated_at)
    VALUES
      (${observerAddress}, ${observedAddress}, ${overallTrustWeight},
       ${JSON.stringify(regimeTrust ?? {})}::jsonb,
       ${agreedAndWon}, ${agreedAndLost}, ${disagreedAndTheyWon}, ${disagreedAndIWon},
       ${divergencePremium}, ${lastUpdatedCycle}, NOW())
    ON CONFLICT (observer_address, observed_address)
    DO UPDATE SET
      overall_trust_weight     = EXCLUDED.overall_trust_weight,
      regime_trust             = EXCLUDED.regime_trust,
      agreed_and_won           = EXCLUDED.agreed_and_won,
      agreed_and_lost          = EXCLUDED.agreed_and_lost,
      disagreed_and_they_won   = EXCLUDED.disagreed_and_they_won,
      disagreed_and_i_won      = EXCLUDED.disagreed_and_i_won,
      divergence_premium       = EXCLUDED.divergence_premium,
      last_updated_cycle       = EXCLUDED.last_updated_cycle,
      updated_at               = NOW()
  `);
};

export const getTrustModelsForAgent = async (observerAddress) => {
  return getDb().execute(sql`
    SELECT * FROM agent_trust_models
    WHERE observer_address = ${observerAddress}
    ORDER BY overall_trust_weight DESC
  `);
};

// ─── Prediction history for strategy evaluation ───────────────────────────────

// Fetch dev-set (non-holdout) scored predictions for an agent, suitable for backtest.
export const getDevSetPredictions = async (agentAddress, { coin, timeframe, regimeFilter } = {}) => {
  const coinFilter     = coin        ? sql`AND prediction_coin = ${coin}` : sql``;
  const tfFilter       = timeframe   ? sql`AND timeframe = ${timeframe}` : sql``;
  const regimeF        = regimeFilter ? sql`AND market_regime = ${regimeFilter}` : sql``;

  return getDb().execute(sql`
    SELECT id, prediction_coin AS coin, direction, timeframe,
           prediction_outcome AS outcome, confidence,
           prediction_price_at_call AS price_at_call,
           prediction_price_at_expiry AS price_at_expiry,
           prediction_net_delta AS net_delta,
           atr_at_call,
           market_regime, funding_regime,
           prediction_indicators AS indicators_at_call,
           created_at
    FROM posts
    WHERE author_address = ${agentAddress}
      AND prediction_scored = TRUE
      AND prediction_coin IS NOT NULL
      AND is_holdout = FALSE
      AND deleted_at IS NULL
      ${coinFilter} ${tfFilter} ${regimeF}
    ORDER BY created_at ASC
  `);
};

// Fetch holdout-set scored predictions for final gate validation.
// Only call after dev validation passes — unsealing holdout prematurely contaminates the split.
export const getHoldoutSetPredictions = async (agentAddress, { coin, timeframe } = {}) => {
  const coinFilter = coin      ? sql`AND prediction_coin = ${coin}` : sql``;
  const tfFilter   = timeframe ? sql`AND timeframe = ${timeframe}` : sql``;

  return getDb().execute(sql`
    SELECT id, prediction_coin AS coin, direction, timeframe,
           prediction_outcome AS outcome, confidence,
           prediction_price_at_call AS price_at_call,
           prediction_price_at_expiry AS price_at_expiry,
           prediction_net_delta AS net_delta,
           atr_at_call,
           market_regime, funding_regime,
           created_at
    FROM posts
    WHERE author_address = ${agentAddress}
      AND prediction_scored = TRUE
      AND prediction_coin IS NOT NULL
      AND is_holdout = TRUE
      AND deleted_at IS NULL
      ${coinFilter} ${tfFilter}
    ORDER BY created_at ASC
  `);
};
