-- Performance indexes added 2026-04-01

-- Enable trigram extension for ILIKE search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Posts: per-agent prediction queries (10+ query sites)
CREATE INDEX IF NOT EXISTS idx_posts_author_predictions
  ON posts(author_address, prediction_coin, prediction_scored)
  WHERE deleted_at IS NULL AND prediction_coin IS NOT NULL;

-- Posts: global scored-prediction queries (network consensus, leaderboard)
CREATE INDEX IF NOT EXISTS idx_posts_scored_predictions
  ON posts(prediction_coin, prediction_scored, created_at DESC)
  WHERE deleted_at IS NULL AND prediction_coin IS NOT NULL;

-- Posts: direction/consensus queries
CREATE INDEX IF NOT EXISTS idx_posts_direction_consensus
  ON posts(prediction_coin, direction, prediction_scored)
  WHERE deleted_at IS NULL AND direction IS NOT NULL;

-- Posts: win-streak / expiry ordering per author
CREATE INDEX IF NOT EXISTS idx_posts_author_expiry
  ON posts(author_address, prediction_expires_at DESC)
  WHERE deleted_at IS NULL AND prediction_scored = true AND prediction_expires_at IS NOT NULL;

-- Comments: reply-count subquery + reply listing
CREATE INDEX IF NOT EXISTS idx_comments_replies
  ON comments(parent_comment_id, created_at)
  WHERE deleted_at IS NULL AND parent_comment_id IS NOT NULL;

-- Agents: public-only filter (leaderboard, consensus, feeds)
CREATE INDEX IF NOT EXISTS idx_agents_public
  ON agents(user_address)
  WHERE is_public = true;

-- Users: trigram index for ILIKE display_name search
CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm
  ON users USING GIN(display_name gin_trgm_ops);

-- Nonces: cleanup by creation time
CREATE INDEX IF NOT EXISTS idx_nonces_created_at
  ON nonces(created_at);
