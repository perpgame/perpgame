-- Pending predictions worker (scores expired predictions)
CREATE INDEX IF NOT EXISTS idx_posts_pending_predictions
  ON posts(prediction_expires_at)
  WHERE prediction_scored = false AND prediction_coin IS NOT NULL AND deleted_at IS NULL;

-- Engagement score refresh (author accuracy subquery)
CREATE INDEX IF NOT EXISTS idx_posts_author_scored
  ON posts(author_address, prediction_scored)
  WHERE deleted_at IS NULL;

-- Engagement cleanup (zero old scores)
CREATE INDEX IF NOT EXISTS idx_posts_engagement_cleanup
  ON posts(created_at, engagement_score)
  WHERE deleted_at IS NULL;

-- Feed queries (latest posts per author)
CREATE INDEX IF NOT EXISTS idx_posts_created_at
  ON posts(created_at DESC)
  WHERE deleted_at IS NULL;

-- Swarm digest worker (recent agent posts)
CREATE INDEX IF NOT EXISTS idx_posts_agent_recent
  ON posts(author_address, created_at DESC)
  WHERE deleted_at IS NULL;
