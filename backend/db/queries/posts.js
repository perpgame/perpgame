import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

// ─── CRUD ───────────────────────────────────────────────────────────────────

export const getById = async (id, viewer) => {
  const [row] = await getDb().execute(sql`
    SELECT p.id, p.author_address, p.content, p.tags, p.created_at, p.attachment,
           p.like_count, p.comment_count, p.repost_count,
           EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_address = ${viewer}) AS liked,
           EXISTS(SELECT 1 FROM reposts WHERE post_id = p.id AND user_address = ${viewer}) AS reposted,
           u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
           EXISTS (SELECT 1 FROM agents WHERE user_address = u.address) AS author_is_agent,
           p.quoted_post_id,
           p.direction, p.timeframe, p.prediction_coin, p.prediction_outcome,
           p.prediction_scored, p.prediction_price_at_call, p.prediction_price_at_expiry
    FROM posts p
    LEFT JOIN users u ON u.address = p.author_address
    WHERE p.id = ${id} AND p.deleted_at IS NULL
  `);
  return row || null;
};

export const insertPost = async ({ id, authorAddress, content, tags, attachment, quotedPostId, direction, timeframe, predictionCoin, predictionPriceAtCall, predictionExpiresAt, confidence, predictionIndicators }) => {
  await getDb().execute(sql`
    INSERT INTO posts (id, author_address, content, tags, attachment, quoted_post_id,
                       direction, timeframe,
                       prediction_coin, prediction_price_at_call, prediction_expires_at,
                       confidence, prediction_indicators)
    VALUES (${id}, ${authorAddress}, ${content}, ${JSON.stringify(tags)}::jsonb,
            ${attachment ? JSON.stringify(attachment) : null}::jsonb, ${quotedPostId || null},
            ${direction}, ${timeframe},
            ${predictionCoin}, ${predictionPriceAtCall}, ${predictionExpiresAt ? sql`${predictionExpiresAt}::TIMESTAMPTZ` : null},
            ${confidence}, ${predictionIndicators ? sql`${JSON.stringify(predictionIndicators)}::jsonb` : null})
  `);
};

export const getAfterInsert = async (id) => {
  const [row] = await getDb().execute(sql`
    SELECT id, author_address AS "authorAddress", content, tags, created_at AS "createdAt",
           attachment, quoted_post_id AS "quotedPostId",
           direction, timeframe, confidence,
           prediction_coin AS "predictionCoin", prediction_expires_at AS "predictionExpiresAt"
    FROM posts WHERE id = ${id}
  `);
  return row || null;
};

export const getForDelete = async (id, authorAddress) => {
  const [row] = await getDb().execute(sql`
    SELECT id, prediction_coin, direction FROM posts
    WHERE id = ${id} AND author_address = ${authorAddress} AND deleted_at IS NULL
  `);
  return row || null;
};

export const markDeleted = async (id) => {
  await getDb().execute(sql`UPDATE posts SET deleted_at = NOW() WHERE id = ${id}`);
};

export const hasActivePrediction = async (authorAddress, coin, timeframe) => {
  const [row] = await getDb().execute(sql`
    SELECT id FROM posts
    WHERE author_address = ${authorAddress}
      AND prediction_coin = ${coin}
      AND timeframe = ${timeframe}
      AND prediction_scored = FALSE
      AND deleted_at IS NULL
  `);
  return !!row;
};

// ─── Sentiment / activity ───────────────────────────────────────────────────

export const getAgentSentimentRows = async (hoursAgo = 6) => {
  return getDb().execute(sql`
    SELECT p.tags, p.direction, u.follower_count
    FROM posts p
    JOIN users u ON u.address = p.author_address
    JOIN agents ag ON ag.user_address = u.address
    WHERE p.deleted_at IS NULL
      AND p.created_at > NOW() - INTERVAL '${sql.raw(String(hoursAgo))} hours'
  `);
};

export const getPopularCoins = async () => {
  return getDb().execute(sql`
    SELECT tag::TEXT AS coin,
           COUNT(*)::int AS "postCount",
           COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '24 hours')::int AS "recentCount"
    FROM posts p, jsonb_array_elements_text(p.tags) AS tag
    WHERE p.created_at > NOW() - INTERVAL '30 days' AND p.deleted_at IS NULL
      AND tag ~ '^[A-Z]{2,10}$'
    GROUP BY tag ORDER BY "postCount" DESC LIMIT 30
  `);
};

export const getCoinActivity = async () => {
  return getDb().execute(sql`
    SELECT
      tag::TEXT AS coin,
      COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '1 hour')::int AS "h1",
      COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '6 hours')::int AS "h6",
      COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '24 hours')::int AS "h24",
      COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '7 days')::int AS "d7",
      COUNT(DISTINCT p.author_address) FILTER (WHERE p.created_at > NOW() - INTERVAL '24 hours')::int AS "agents24h"
    FROM posts p, jsonb_array_elements_text(p.tags) AS tag
    WHERE p.created_at > NOW() - INTERVAL '30 days'
      AND p.deleted_at IS NULL
      AND tag ~ '^[A-Z]{2,10}$'
    GROUP BY tag
    HAVING COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '7 days') >= 2
  `);
};

// ─── Agent feeds (agentSocial) ──────────────────────────────────────────────

export const getAgentFeedRanked = async ({ conditions, orderBy, limit }) => {
  const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);
  return getDb().execute(sql`
    SELECT p.id, p.author_address, p.content, p.tags,
           p.like_count, p.comment_count, p.created_at,
           u.username AS author_username, u.display_name AS author_display_name,
           acc.accuracy AS author_accuracy, acc.total AS author_predictions
    FROM posts p
    JOIN users u ON u.address = p.author_address
    LEFT JOIN agents a ON a.user_address = p.author_address
    LEFT JOIN LATERAL (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::numeric, 0) * 100, 1
      ) AS accuracy,
      COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::int AS total
      FROM posts p2
      WHERE p2.author_address = p.author_address
        AND p2.prediction_scored = true AND p2.deleted_at IS NULL
    ) acc ON true
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `);
};

export const getFollowFeed = async ({ followerAddress, hoursAgo, limit }) => {
  return getDb().execute(sql`
    SELECT p.id, p.author_address, p.content, p.tags,
           p.like_count, p.comment_count, p.created_at,
           u.username AS author_username, u.display_name AS author_display_name,
           acc.accuracy AS author_accuracy, acc.total AS author_predictions
    FROM posts p
    JOIN users u ON u.address = p.author_address
    LEFT JOIN agents a2 ON a2.user_address = p.author_address
    JOIN follows f ON f.followed_address = p.author_address AND f.follower_address = ${followerAddress}
    LEFT JOIN LATERAL (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::numeric, 0) * 100, 1
      ) AS accuracy,
      COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::int AS total
      FROM posts p2
      WHERE p2.author_address = p.author_address
        AND p2.prediction_scored = true AND p2.deleted_at IS NULL
    ) acc ON true
    WHERE a2.user_address IS NOT NULL AND p.deleted_at IS NULL
      AND p.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `);
};

export const getSentimentWeightedConsensus = async () => {
  return getDb().execute(sql`
    WITH agent_acc AS (
      SELECT author_address,
             COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric
               / NULLIF(COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::numeric, 0) AS acc
      FROM posts
      WHERE prediction_scored = true AND prediction_coin IS NOT NULL AND deleted_at IS NULL
      GROUP BY author_address
      HAVING COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong')) >= 3
    ),
    tagged AS (
      SELECT p.author_address, p.direction, tag::TEXT AS coin
      FROM posts p, jsonb_array_elements_text(p.tags) AS tag
      WHERE p.direction IS NOT NULL AND p.deleted_at IS NULL
        AND tag ~ '^[A-Z]{2,10}$'
        AND p.created_at > NOW() - INTERVAL '6 hours'
    )
    SELECT t.coin, t.direction, COALESCE(aa.acc, 0.5) AS weight
    FROM tagged t
    LEFT JOIN agent_acc aa ON aa.author_address = t.author_address
  `);
};

// ─── Agent profile posts (agentSocial /me) ──────────────────────────────────

export const getPostStatsForAuthor = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT COUNT(*)::int AS post_count,
           COALESCE(SUM(like_count), 0)::int AS total_likes,
           COALESCE(SUM(comment_count), 0)::int AS total_comments
    FROM posts WHERE author_address = ${address} AND deleted_at IS NULL
  `);
  return row || { post_count: 0, total_likes: 0, total_comments: 0 };
};

export const getRecentPostsByAuthor = async (address, limit = 10) => {
  return getDb().execute(sql`
    SELECT id, content, tags, like_count, comment_count, created_at
    FROM posts WHERE author_address = ${address} AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT ${limit}
  `);
};

export const getTagPerformance = async (address, limit = 10) => {
  return getDb().execute(sql`
    SELECT tag::TEXT AS tag, COUNT(*)::int AS post_count,
           COALESCE(SUM(p.like_count), 0)::int AS total_likes
    FROM posts p, jsonb_array_elements_text(p.tags) AS tag
    WHERE p.author_address = ${address} AND p.deleted_at IS NULL
    GROUP BY tag ORDER BY total_likes DESC LIMIT ${limit}
  `);
};

export const getTopPostsByEngagement = async (address, limit = 10) => {
  return getDb().execute(sql`
    SELECT id, content, tags, like_count, comment_count, repost_count,
           engagement_score, created_at
    FROM posts WHERE author_address = ${address} AND deleted_at IS NULL
    ORDER BY engagement_score DESC LIMIT ${limit}
  `);
};

export const getTagStats = async (address, limit = 20) => {
  return getDb().execute(sql`
    SELECT tag::TEXT AS tag, COUNT(*)::int AS posts,
           COALESCE(SUM(p.like_count), 0)::int AS likes,
           COALESCE(SUM(p.comment_count), 0)::int AS comments,
           COALESCE(SUM(p.repost_count), 0)::int AS reposts,
           ROUND(AVG(p.engagement_score)::numeric, 2) AS avg_engagement
    FROM posts p, jsonb_array_elements_text(p.tags) AS tag
    WHERE p.author_address = ${address} AND p.deleted_at IS NULL
    GROUP BY tag ORDER BY avg_engagement DESC LIMIT ${limit}
  `);
};

export const getPostsByHour = async (address) => {
  return getDb().execute(sql`
    SELECT EXTRACT(HOUR FROM p.created_at)::int AS hour, COUNT(*)::int AS posts,
           ROUND(AVG(p.engagement_score)::numeric, 2) AS avg_engagement,
           COALESCE(SUM(p.like_count), 0)::int AS likes
    FROM posts p WHERE p.author_address = ${address} AND p.deleted_at IS NULL
    GROUP BY hour ORDER BY avg_engagement DESC
  `);
};

export const getPostsByDay = async (address) => {
  return getDb().execute(sql`
    SELECT EXTRACT(DOW FROM p.created_at)::int AS day, COUNT(*)::int AS posts,
           ROUND(AVG(p.engagement_score)::numeric, 2) AS avg_engagement,
           COALESCE(SUM(p.like_count), 0)::int AS likes
    FROM posts p WHERE p.author_address = ${address} AND p.deleted_at IS NULL
    GROUP BY day ORDER BY avg_engagement DESC
  `);
};

export const getPostTotals = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT COUNT(*)::int AS posts, COALESCE(SUM(like_count), 0)::int AS likes,
           COALESCE(SUM(comment_count), 0)::int AS comments,
           COALESCE(SUM(repost_count), 0)::int AS reposts,
           ROUND(AVG(engagement_score)::numeric, 2) AS avg_engagement
    FROM posts WHERE author_address = ${address} AND deleted_at IS NULL
  `);
  return row || {};
};

// ─── Predictions ────────────────────────────────────────────────────────────

export const getRecentScoredPredictions = async (address, limit = 5) => {
  return getDb().execute(sql`
    SELECT p.id, p.content, p.prediction_coin AS coin, p.direction, p.timeframe,
           p.prediction_outcome AS outcome,
           p.prediction_price_at_call AS price_at_call,
           p.prediction_price_at_expiry AS price_at_expiry,
           p.prediction_expires_at AS scored_at,
           p.prediction_indicators AS indicators_at_call,
           p.prediction_lesson AS lesson,
           p.prediction_lesson_type AS lesson_type
    FROM posts p
    WHERE p.author_address = ${address}
      AND p.prediction_scored = true
      AND p.prediction_coin IS NOT NULL
      AND p.deleted_at IS NULL
    ORDER BY p.prediction_expires_at DESC
    LIMIT ${limit}
  `);
};

export const upsertPredictionLesson = async (postId, authorAddress, lesson, type) => {
  const [row] = await getDb().execute(sql`
    UPDATE posts
    SET prediction_lesson = ${lesson},
        prediction_lesson_type = ${type}
    WHERE id = ${postId}
      AND author_address = ${authorAddress}
      AND prediction_scored = true
      AND prediction_coin IS NOT NULL
      AND deleted_at IS NULL
    RETURNING id
  `);
  return row || null;
};

export const getRecentLessons = async (address, coin = null, limit = 20) => {
  const coinFilter = coin ? sql`AND p.prediction_coin = ${coin}` : sql``;
  return getDb().execute(sql`
    SELECT p.id, p.prediction_coin AS coin, p.direction, p.timeframe,
           p.prediction_outcome AS outcome,
           p.prediction_lesson AS lesson,
           p.prediction_lesson_type AS lesson_type,
           p.prediction_expires_at AS scored_at
    FROM posts p
    WHERE p.author_address = ${address}
      AND p.prediction_scored = true
      AND p.prediction_lesson IS NOT NULL
      AND p.prediction_coin IS NOT NULL
      AND p.deleted_at IS NULL
      ${coinFilter}
    ORDER BY p.prediction_expires_at DESC
    LIMIT ${limit}
  `);
};

export const getPredictions = async ({ author, coin, timeframe, status, outcome, before, limit }) => {
  const conditions = [
    sql`p.prediction_coin IS NOT NULL`,
    sql`p.direction IS NOT NULL`,
    sql`p.deleted_at IS NULL`,
  ];
  if (author) conditions.push(sql`p.author_address = ${author}`);
  if (coin) conditions.push(sql`p.prediction_coin = ${coin}`);
  if (timeframe) conditions.push(sql`p.timeframe = ${timeframe}`);
  if (outcome) conditions.push(sql`p.prediction_outcome = ${outcome}`);
  if (status === "active") {
    conditions.push(sql`p.prediction_scored = FALSE`);
    conditions.push(sql`p.prediction_expires_at > NOW()`);
  } else if (status === "pending") {
    conditions.push(sql`p.prediction_scored = FALSE`);
    conditions.push(sql`p.prediction_expires_at <= NOW()`);
  }

  if (before) conditions.push(sql`p.created_at < ${before}::TIMESTAMPTZ`);

  const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

  return getDb().execute(sql`
    SELECT p.id, p.author_address, p.content, p.tags, p.direction, p.timeframe, p.confidence,
           p.prediction_coin AS coin, p.prediction_price_at_call AS price_at_call,
           p.prediction_price_at_expiry AS price_at_expiry,
           p.prediction_expires_at AS expires_at,
           p.prediction_scored AS scored, p.prediction_outcome AS outcome,
           p.prediction_indicators AS indicators_at_call,
           p.prediction_lesson AS lesson,
           p.prediction_lesson_type AS lesson_type,
           p.created_at,
           u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url
    FROM posts p
    LEFT JOIN users u ON u.address = p.author_address
    WHERE ${where}
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `);
};

export const getOverallAccuracy = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*) FILTER (WHERE prediction_scored = true)::int AS total,
           COUNT(*) FILTER (WHERE prediction_scored = false AND prediction_expires_at IS NOT NULL)::int AS pending,
           AVG(ABS(prediction_price_at_expiry - prediction_price_at_call) / NULLIF(prediction_price_at_call, 0) * 100)
             FILTER (WHERE prediction_outcome = 'correct') AS avg_delta_correct,
           AVG(ABS(prediction_price_at_expiry - prediction_price_at_call) / NULLIF(prediction_price_at_call, 0) * 100)
             FILTER (WHERE prediction_outcome = 'wrong') AS avg_delta_wrong,
           ROUND(
             COUNT(*) FILTER (WHERE prediction_outcome = 'correct' AND prediction_expires_at > NOW() - INTERVAL '7 days')::numeric /
             NULLIF(COUNT(*) FILTER (WHERE prediction_scored = true AND prediction_expires_at > NOW() - INTERVAL '7 days')::numeric, 0) * 100, 1
           ) AS accuracy_7d
    FROM posts
    WHERE author_address = ${address}
      AND prediction_coin IS NOT NULL
      AND direction IS NOT NULL
      AND deleted_at IS NULL
  `);
  return row || {};
};

export const getAccuracyByCoin = async (address) => {
  return getDb().execute(sql`
    SELECT prediction_coin AS coin,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*) FILTER (WHERE prediction_scored = true)::int AS total
    FROM posts
    WHERE author_address = ${address} AND prediction_coin IS NOT NULL
      AND direction IS NOT NULL AND deleted_at IS NULL
    GROUP BY prediction_coin ORDER BY total DESC
  `);
};

export const getAccuracyByTimeframe = async (address) => {
  return getDb().execute(sql`
    SELECT timeframe,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*) FILTER (WHERE prediction_scored = true)::int AS total
    FROM posts
    WHERE author_address = ${address} AND prediction_coin IS NOT NULL
      AND direction IS NOT NULL AND timeframe IS NOT NULL AND deleted_at IS NULL
    GROUP BY timeframe ORDER BY total DESC
  `);
};

export const getAccuracyByDirection = async (address) => {
  return getDb().execute(sql`
    SELECT direction,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*) FILTER (WHERE prediction_scored = true)::int AS total
    FROM posts
    WHERE author_address = ${address} AND prediction_coin IS NOT NULL
      AND direction IS NOT NULL AND deleted_at IS NULL
    GROUP BY direction
  `);
};

export const getRecentOutcomes = async (address, limit = 20) => {
  return getDb().execute(sql`
    SELECT prediction_outcome AS outcome, prediction_expires_at AS "expiresAt",
           prediction_coin AS coin, direction
    FROM posts
    WHERE author_address = ${address} AND prediction_scored = true
      AND prediction_coin IS NOT NULL AND deleted_at IS NULL
    ORDER BY prediction_expires_at DESC LIMIT ${limit}
  `);
};

export const getRollingAccuracy = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT
      ROUND(
        COUNT(*) FILTER (WHERE prediction_outcome = 'correct' AND prediction_expires_at > NOW() - INTERVAL '7 days')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE prediction_scored = true AND prediction_expires_at > NOW() - INTERVAL '7 days')::numeric, 0) * 100, 1
      ) AS accuracy_7d,
      ROUND(
        COUNT(*) FILTER (WHERE prediction_outcome = 'correct' AND prediction_expires_at > NOW() - INTERVAL '30 days')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE prediction_scored = true AND prediction_expires_at > NOW() - INTERVAL '30 days')::numeric, 0) * 100, 1
      ) AS accuracy_30d
    FROM posts
    WHERE author_address = ${address} AND prediction_coin IS NOT NULL
      AND direction IS NOT NULL AND deleted_at IS NULL
  `);
  return row || {};
};

export const getDeltaStats = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT
      AVG(ABS(prediction_price_at_expiry - prediction_price_at_call) / NULLIF(prediction_price_at_call, 0) * 100)
        FILTER (WHERE prediction_outcome = 'correct') AS avg_delta_correct,
      AVG(ABS(prediction_price_at_expiry - prediction_price_at_call) / NULLIF(prediction_price_at_call, 0) * 100)
        FILTER (WHERE prediction_outcome = 'wrong') AS avg_delta_wrong
    FROM posts
    WHERE author_address = ${address} AND prediction_coin IS NOT NULL
      AND prediction_scored = true AND deleted_at IS NULL
  `);
  return row || {};
};

export const getCalibrationByConfidence = async (address) => {
  return getDb().execute(sql`
    SELECT
      CASE
        WHEN confidence >= 0.8 THEN 'high'
        WHEN confidence >= 0.5 THEN 'medium'
        ELSE 'low'
      END AS confidence_level,
      COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
      COUNT(*)::int AS total,
      ROUND(COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 1) AS accuracy
    FROM posts
    WHERE author_address = ${address}
      AND prediction_scored = true AND confidence IS NOT NULL AND deleted_at IS NULL
    GROUP BY 1
  `);
};

export const getPredictionFrequency24h = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT COUNT(*)::int AS count
    FROM posts
    WHERE author_address = ${address}
      AND prediction_coin IS NOT NULL AND direction IS NOT NULL
      AND deleted_at IS NULL
      AND created_at > NOW() - INTERVAL '24 hours'
  `);
  return row?.count || 0;
};

export const getNetworkConsensus = async () => {
  return getDb().execute(sql`
    WITH agent_acc AS (
      SELECT author_address,
             COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric
               / NULLIF(COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::numeric, 0) AS acc
      FROM posts
      WHERE prediction_scored = true AND prediction_coin IS NOT NULL AND deleted_at IS NULL
      GROUP BY author_address
      HAVING COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong')) >= 3
    )
    SELECT p.prediction_coin AS coin, p.direction,
           COALESCE(aa.acc, 0.5) AS weight
    FROM posts p
    LEFT JOIN agent_acc aa ON aa.author_address = p.author_address
    JOIN agents a ON a.user_address = p.author_address
    WHERE p.prediction_coin IS NOT NULL AND p.direction IS NOT NULL
      AND p.deleted_at IS NULL AND a.is_public = true
      AND p.created_at > NOW() - INTERVAL '24 hours'
  `);
};

// ─── Leaderboard queries (agentLeaderboard) ─────────────────────────────────

export const getPredictionLeaderboard = async ({ coin, timeframe, minPredictions, limit, period }) => {
  const conditions = [
    sql`p.prediction_coin IS NOT NULL`,
    sql`p.direction IS NOT NULL`,
    sql`p.prediction_scored = true`,
    sql`p.deleted_at IS NULL`,
    sql`a.is_public = true`,
  ];
  if (coin) conditions.push(sql`p.prediction_coin = ${coin}`);
  if (timeframe) conditions.push(sql`p.timeframe = ${timeframe}`);
  if (period === "7d") conditions.push(sql`p.created_at > NOW() - INTERVAL '7 days'`);
  else if (period === "30d") conditions.push(sql`p.created_at > NOW() - INTERVAL '30 days'`);

  const where = conditions.reduce((a, b) => sql`${a} AND ${b}`);

  return getDb().execute(sql`
    SELECT a.user_address, u.display_name AS name, u.avatar_url, u.username,
           COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE p.prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::int AS total,
           ROUND(
             COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::numeric /
             NULLIF(COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric, 0) * 100, 1
           ) AS accuracy
    FROM posts p
    JOIN agents a ON a.user_address = p.author_address
    JOIN users u ON u.address = a.user_address
    WHERE ${where}
    GROUP BY a.user_address, u.display_name, u.avatar_url, u.username
    HAVING COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong')) >= ${minPredictions}
    ORDER BY
      (COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::numeric + 1.9208)
      / (COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric + 3.8416)
      - 1.96 * SQRT(
        (COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::numeric
         * COUNT(*) FILTER (WHERE p.prediction_outcome = 'wrong')::numeric)
        / (COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric * COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric)
        + 0.9604 / (COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric)
      ) / (COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric + 3.8416)
      DESC
  `);
};

export const getNetworkPredictionStats = async (timeFilter) => {
  const [row] = await getDb().execute(sql`
    SELECT
      COUNT(*)::int AS "totalPredictions",
      COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS "totalCorrect",
      COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS "totalWrong",
      COUNT(*) FILTER (WHERE prediction_scored = false AND prediction_expires_at IS NOT NULL)::int AS "pendingPredictions",
      COUNT(DISTINCT author_address)::int AS "activeAgents",
      ROUND(
        COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::numeric, 0) * 100, 1
      ) AS "networkAccuracy"
    FROM posts
    WHERE prediction_coin IS NOT NULL
      AND direction IS NOT NULL
      AND deleted_at IS NULL
      ${timeFilter}
  `);
  return row || {};
};

export const getAgentPostsToday = async () => {
  const [row] = await getDb().execute(sql`
    SELECT
      COUNT(*)::int AS "totalPosts",
      COUNT(DISTINCT author_address)::int AS "postersToday",
      COALESCE(SUM(p.like_count), 0)::int AS "totalLikes"
    FROM posts p
    JOIN users u ON u.address = p.author_address
    JOIN agents ag ON ag.user_address = u.address
    WHERE p.deleted_at IS NULL
      AND p.created_at > NOW() - INTERVAL '24 hours'
  `);
  return row || {};
};

export const getAccuracyWeightsPerAgent = async () => {
  return getDb().execute(sql`
    SELECT author_address,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::numeric AS total
    FROM posts
    WHERE prediction_coin IS NOT NULL AND direction IS NOT NULL
      AND prediction_scored = true AND deleted_at IS NULL
    GROUP BY author_address
    HAVING COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong')) >= 3
  `);
};

export const getRecentDirectionalPredictions = async () => {
  return getDb().execute(sql`
    SELECT p.author_address, p.prediction_coin, p.direction
    FROM posts p
    JOIN agents a ON a.user_address = p.author_address
    WHERE p.prediction_coin IS NOT NULL
      AND p.direction IS NOT NULL
      AND p.deleted_at IS NULL
      AND a.is_public = true
      AND p.created_at > NOW() - INTERVAL '24 hours'
  `);
};

export const getRecentScoredFeed = async (limit = 15) => {
  return getDb().execute(sql`
    SELECT p.id, p.author_address, p.prediction_coin AS coin, p.direction,
           p.prediction_outcome AS outcome, p.prediction_price_at_call AS "priceAtCall",
           p.prediction_price_at_expiry AS "priceAtExpiry", p.timeframe,
           p.prediction_expires_at AS "scoredAt",
           u.display_name AS "agentName", u.avatar_url AS "avatarUrl"
    FROM posts p
    JOIN agents a ON a.user_address = p.author_address
    JOIN users u ON u.address = p.author_address
    WHERE p.prediction_scored = true
      AND p.prediction_coin IS NOT NULL
      AND p.deleted_at IS NULL
      AND a.is_public = true
      AND p.prediction_price_at_call > 0
      AND p.prediction_price_at_expiry > 0
    ORDER BY p.prediction_expires_at DESC
    LIMIT ${limit}
  `);
};

export const getPredictionVelocity = async () => {
  return getDb().execute(sql`
    SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
    FROM posts
    WHERE prediction_coin IS NOT NULL
      AND direction IS NOT NULL
      AND deleted_at IS NULL
      AND created_at > NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1
  `);
};

export const getWinStreaks = async (limit = 10) => {
  return getDb().execute(sql`
    WITH ranked AS (
      SELECT p.author_address, p.prediction_outcome,
             ROW_NUMBER() OVER (PARTITION BY p.author_address ORDER BY p.prediction_expires_at DESC) AS rn
      FROM posts p
      JOIN agents a ON a.user_address = p.author_address
      WHERE p.prediction_scored = true
        AND p.prediction_coin IS NOT NULL
        AND p.prediction_outcome IN ('correct', 'wrong')
        AND p.deleted_at IS NULL
        AND a.is_public = true
    ),
    first_miss AS (
      SELECT author_address, MIN(rn) AS miss_rn
      FROM ranked
      WHERE prediction_outcome = 'wrong'
      GROUP BY author_address
    ),
    streaks AS (
      SELECT r.author_address,
             COUNT(*)::int AS streak
      FROM ranked r
      LEFT JOIN first_miss fm ON fm.author_address = r.author_address
      WHERE r.prediction_outcome = 'correct'
        AND r.rn < COALESCE(fm.miss_rn, 999999)
      GROUP BY r.author_address
      HAVING COUNT(*) >= 2
    )
    SELECT s.streak, a.user_address, u.display_name AS name, u.avatar_url AS "avatarUrl"
    FROM streaks s
    JOIN agents a ON a.user_address = s.author_address
    JOIN users u ON u.address = s.author_address
    ORDER BY s.streak DESC
    LIMIT ${limit}
  `);
};

export const getAccuracyTrend = async () => {
  return getDb().execute(sql`
    SELECT date_trunc('day', prediction_expires_at) AS day,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*)::int AS total
    FROM posts
    WHERE prediction_scored = true
      AND prediction_coin IS NOT NULL
      AND deleted_at IS NULL
      AND prediction_expires_at > NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1
  `);
};

export const getPredictionCoverage = async () => {
  const [row] = await getDb().execute(sql`
    SELECT ARRAY_AGG(DISTINCT prediction_coin) AS coins,
           COUNT(DISTINCT prediction_coin)::int AS active
    FROM posts
    WHERE prediction_scored = false
      AND prediction_coin IS NOT NULL
      AND prediction_expires_at > NOW()
      AND deleted_at IS NULL
  `);
  return row || { coins: [], active: 0 };
};

export const getMostPredictableCoins = async () => {
  return getDb().execute(sql`
    SELECT prediction_coin AS coin,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*)::int AS total,
           ROUND(
             COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric /
             NULLIF(COUNT(*)::numeric, 0) * 100, 1
           ) AS accuracy,
           COUNT(DISTINCT author_address)::int AS agents
    FROM posts
    WHERE prediction_scored = true
      AND prediction_coin IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY prediction_coin
    HAVING COUNT(*) >= 5
    ORDER BY accuracy DESC, total DESC
  `);
};

// ─── Agent state view predictions ───────────────────────────────────────────

export const getAccuracyGrouped = async (address) => {
  return getDb().execute(sql`
    SELECT
      prediction_coin AS coin, direction, timeframe,
      prediction_outcome AS outcome,
      COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
      COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong,
      COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::int AS total
    FROM posts
    WHERE author_address = ${address}
      AND prediction_scored = true AND prediction_coin IS NOT NULL AND deleted_at IS NULL
    GROUP BY prediction_coin, direction, timeframe, prediction_outcome
  `);
};

export const getRecentPredictionsList = async (address, limit = 20) => {
  return getDb().execute(sql`
    SELECT id, content, prediction_coin AS coin, direction, timeframe,
           prediction_outcome AS outcome,
           prediction_price_at_call AS price_at_call,
           prediction_price_at_expiry AS price_at_expiry,
           prediction_expires_at AS scored_at, created_at,
           prediction_indicators AS indicators_at_call
    FROM posts
    WHERE author_address = ${address}
      AND prediction_coin IS NOT NULL AND direction IS NOT NULL AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
};

export const getActivePredictions = async (address) => {
  return getDb().execute(sql`
    SELECT id, content, prediction_coin AS coin, direction, timeframe,
           prediction_price_at_call AS price_at_call,
           prediction_expires_at AS expires_at, created_at
    FROM posts
    WHERE author_address = ${address}
      AND prediction_scored = false
      AND prediction_coin IS NOT NULL
      AND prediction_expires_at IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY prediction_expires_at ASC
  `);
};

export const getAuthorAccuracyTrend = async (address) => {
  return getDb().execute(sql`
    SELECT date_trunc('day', prediction_expires_at) AS day,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::int AS total
    FROM posts
    WHERE author_address = ${address}
      AND prediction_scored = true
      AND prediction_coin IS NOT NULL
      AND deleted_at IS NULL
      AND prediction_expires_at > NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY 1
  `);
};

export const getNotableCalls = async ({ hoursAgo = 6, limit = 5 } = {}) => {
  return getDb().execute(sql`
    SELECT p.id, p.author_address, p.content, p.tags, p.direction, p.timeframe,
           p.prediction_coin AS coin, p.created_at,
           u.display_name AS author_display_name, u.username AS author_username,
           acc.accuracy AS author_accuracy, acc.total AS author_predictions
    FROM posts p
    JOIN users u ON u.address = p.author_address
    LEFT JOIN agents a2 ON a2.user_address = p.author_address
    INNER JOIN LATERAL (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::numeric, 0) * 100, 1
      ) AS accuracy,
      COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong'))::int AS total
      FROM posts p2
      WHERE p2.author_address = p.author_address
        AND p2.prediction_scored = true AND p2.deleted_at IS NULL
      HAVING COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong')) >= 5
    ) acc ON acc.accuracy >= 65
    WHERE a2.user_address IS NOT NULL AND p.deleted_at IS NULL
      AND p.direction IS NOT NULL AND p.prediction_coin IS NOT NULL
      AND p.created_at > NOW() - INTERVAL '${sql.raw(String(hoursAgo))} hours'
    ORDER BY acc.accuracy DESC, p.created_at DESC
    LIMIT ${limit}
  `);
};

// ─── Trust weight resolution ────────────────────────────────────────────────

export const resolveAddressNames = async (addresses) => {
  const addrParams = addresses.map(a => sql`${a}`);
  return getDb().execute(sql`
    SELECT u.address, u.username, u.display_name, u.avatar_url
    FROM users u
    WHERE u.address IN (${sql.join(addrParams, sql`,`)})
  `);
};

// ─── Workers: engagement scoring ────────────────────────────────────────────

export const refreshEngagementScores = async () => {
  const result = await getDb().execute(sql`
    UPDATE posts SET engagement_score =
      (like_count + comment_count * 3 + repost_count * 2 + 1)::DOUBLE PRECISION
      / POWER(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0 + 2.0, 1.5)
      * COALESCE((
        SELECT 1.0 + LEAST(
          COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::DOUBLE PRECISION
          / NULLIF(COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong')), 0),
          1.0
        )
        FROM posts p2
        WHERE p2.author_address = posts.author_address
          AND p2.prediction_scored = true
          AND p2.deleted_at IS NULL
        HAVING COUNT(*) FILTER (WHERE prediction_outcome IN ('correct','wrong')) >= 5
      ), 1.0)
    WHERE deleted_at IS NULL AND created_at > NOW() - INTERVAL '7 days'
  `);
  return result.rowCount ?? 0;
};

export const zeroOldEngagementScores = async () => {
  await getDb().execute(sql`
    UPDATE posts SET engagement_score = 0
    WHERE deleted_at IS NULL AND created_at <= NOW() - INTERVAL '7 days' AND engagement_score > 0
  `);
};

// ─── Workers: prediction scoring ────────────────────────────────────────────

export const getPendingPredictions = async (limit = 50) => {
  return getDb().execute(sql`
    SELECT id, author_address, prediction_coin, prediction_price_at_call, direction, timeframe,
           prediction_expires_at AS "expiresAt"
    FROM posts
    WHERE prediction_scored = FALSE
      AND prediction_expires_at IS NOT NULL
      AND prediction_expires_at <= NOW()
      AND prediction_coin IS NOT NULL
      AND direction IS NOT NULL
      AND prediction_price_at_call IS NOT NULL
      AND deleted_at IS NULL
    ORDER BY prediction_expires_at ASC
    LIMIT ${limit}
  `);
};

export const scorePrediction = async (postId, outcome, priceAtExpiry) => {
  await getDb().execute(sql`
    UPDATE posts SET prediction_scored = TRUE, prediction_outcome = ${outcome},
                     prediction_price_at_expiry = ${priceAtExpiry}
    WHERE id = ${postId}
  `);
};

// ─── Workers: swarm digest ──────────────────────────────────────────────────

export const getRecentAgentPostsForDigest = async (periodStart, limit = 200) => {
  return getDb().execute(sql`
    SELECT p.content, p.tags, p.direction, p.like_count, p.comment_count,
           p.repost_count, p.engagement_score, u.display_name, u.username
    FROM posts p
    JOIN users u ON u.address = p.author_address
    JOIN agents ag ON ag.user_address = u.address
    WHERE p.deleted_at IS NULL
      AND p.created_at > ${periodStart instanceof Date ? periodStart.toISOString() : periodStart}
    ORDER BY p.engagement_score DESC
    LIMIT ${limit}
  `);
};

// ─── Helpers: quoted posts & preview ────────────────────────────────────────

export const fetchQuotedPosts = async (ids) => {
  return getDb().execute(sql`
    SELECT p.id, p.content, p.author_address, u.username, u.display_name, u.avatar_url,
           EXISTS (SELECT 1 FROM agents WHERE user_address = u.address) AS is_agent,
           p.attachment, p.created_at
    FROM posts p
    LEFT JOIN users u ON u.address = p.author_address
    WHERE p.id IN ${sql`(${sql.join(ids.map(id => sql`${id}`), sql`, `)})`}
  `);
};

export const getPostPreview = async (postId) => {
  const [row] = await getDb().execute(sql`SELECT LEFT(content, 100) AS preview FROM posts WHERE id = ${postId}`);
  return row?.preview || null;
};

export const resolvePostsByIds = async (postIds) => {
  if (!postIds.length) return [];
  const idParams = postIds.map(id => sql`${id}`);
  return getDb().execute(sql`
    SELECT p.id, p.author_address, p.prediction_coin, p.direction, p.timeframe,
           p.prediction_outcome, p.prediction_scored, p.prediction_price_at_call,
           p.prediction_price_at_expiry, p.created_at,
           u.display_name AS author_name, u.avatar_url
    FROM posts p
    LEFT JOIN users u ON u.address = p.author_address
    LEFT JOIN agents a ON a.user_address = p.author_address
    WHERE p.id IN (${sql.join(idParams, sql`,`)}) AND p.deleted_at IS NULL
  `);
};
