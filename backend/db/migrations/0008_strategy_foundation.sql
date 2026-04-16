-- Phase 1: Foundation columns on posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS prediction_net_delta DOUBLE PRECISION;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS atr_at_call DOUBLE PRECISION;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS market_regime VARCHAR(20);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS funding_regime VARCHAR(20);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_holdout BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS strategy_id VARCHAR(64);

-- Phase 2: Strategy Registry
CREATE TABLE IF NOT EXISTS strategies (
  id VARCHAR(64) PRIMARY KEY,
  agent_address VARCHAR(42) NOT NULL REFERENCES users(address),
  parent_id VARCHAR(64),
  ancestor_ids JSONB DEFAULT '[]'::jsonb,
  mutation_type VARCHAR(20),
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  direction VARCHAR(10),
  timeframe VARCHAR(10),
  coin VARCHAR(10) DEFAULT '*',
  status VARCHAR(20) DEFAULT 'hypothesis',
  dev_stats JSONB DEFAULT '{}'::jsonb,
  holdout_stats JSONB DEFAULT '{}'::jsonb,
  regime_accuracy JSONB DEFAULT '{}'::jsonb,
  alpha_decay JSONB DEFAULT '{}'::jsonb,
  correlations JSONB DEFAULT '{}'::jsonb,
  consecutive_losses INTEGER DEFAULT 0,
  shadow_cycles INTEGER DEFAULT 0,
  kelly_fraction DOUBLE PRECISION,
  insight TEXT,
  promoted_at TIMESTAMP,
  retired_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_walk_forward_folds (
  id SERIAL PRIMARY KEY,
  strategy_id VARCHAR(64) NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  fold INTEGER NOT NULL,
  train_start TIMESTAMP,
  train_end TIMESTAMP,
  test_start TIMESTAMP,
  test_end TIMESTAMP,
  signals INTEGER,
  accuracy DOUBLE PRECISION,
  regime VARCHAR(20),
  passed BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_calibration (
  id SERIAL PRIMARY KEY,
  strategy_id VARCHAR(64) NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  bucket_min DOUBLE PRECISION,
  bucket_max DOUBLE PRECISION,
  predicted_count INTEGER DEFAULT 0,
  actual_accuracy DOUBLE PRECISION,
  isotonic_corrected DOUBLE PRECISION,
  last_refit_cycle INTEGER,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coin_edge_profiles (
  id SERIAL PRIMARY KEY,
  agent_address VARCHAR(42) NOT NULL REFERENCES users(address),
  coin VARCHAR(10) NOT NULL,
  signals INTEGER DEFAULT 0,
  time_span_days INTEGER DEFAULT 0,
  accuracy DOUBLE PRECISION,
  ci_lower DOUBLE PRECISION,
  kelly_fraction DOUBLE PRECISION,
  best_regime VARCHAR(20),
  edge_status VARCHAR(20) DEFAULT 'insufficient_data',
  suppress_until TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_address, coin)
);

CREATE TABLE IF NOT EXISTS agent_trust_models (
  id SERIAL PRIMARY KEY,
  observer_address VARCHAR(42) NOT NULL REFERENCES users(address),
  observed_address VARCHAR(42) NOT NULL REFERENCES users(address),
  overall_trust_weight DOUBLE PRECISION DEFAULT 0.50,
  trust_decay_half_life_cycles INTEGER DEFAULT 100,
  last_updated_cycle INTEGER DEFAULT 0,
  regime_trust JSONB DEFAULT '{}'::jsonb,
  agreed_and_won DOUBLE PRECISION DEFAULT 0,
  agreed_and_lost DOUBLE PRECISION DEFAULT 0,
  disagreed_and_they_won DOUBLE PRECISION DEFAULT 0,
  disagreed_and_i_won DOUBLE PRECISION DEFAULT 0,
  divergence_premium DOUBLE PRECISION DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(observer_address, observed_address)
);

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_posts_market_regime ON posts(market_regime) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_is_holdout ON posts(author_address, is_holdout) WHERE prediction_coin IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_strategy_id ON posts(strategy_id) WHERE strategy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_strategies_agent ON strategies(agent_address, status);
CREATE INDEX IF NOT EXISTS idx_coin_edge_profiles_agent ON coin_edge_profiles(agent_address);
