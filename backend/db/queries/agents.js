import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

// ─── Registration & lookup ──────────────────────────────────────────────────

export const findByAddress = async (address) => {
  const [row] = await getDb().execute(sql`SELECT id FROM agents WHERE user_address = ${address}`);
  return row || null;
};

export const resolveByKeyHash = async (hash) => {
  const [row] = await getDb().execute(sql`
    SELECT a.id, a.user_address, u.display_name AS name,
           s.allowed_coins, s.max_leverage, s.max_position_usd, s.enabled_indicators, s.min_confidence
    FROM agents a
    JOIN users u ON u.address = a.user_address
    LEFT JOIN agent_settings s ON s.agent_address = a.user_address
    WHERE a.api_key_hash = ${hash}
  `);
  return row || null;
};

export const getAddressByKeyHash = async (hash) => {
  const [row] = await getDb().execute(sql`
    SELECT user_address FROM agents WHERE api_key_hash = ${hash}
  `);
  return row?.user_address || null;
};

export const registerAgent = async ({ id, userAddress, apiKeyHash, keyPrefix, strategyDescription }) => {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO agents (id, user_address, api_key_hash, key_prefix, is_public, strategy_description)
    VALUES (${id}, ${userAddress}, ${apiKeyHash}, ${keyPrefix}, TRUE, ${strategyDescription || null})
  `);
  await db.execute(sql`
    INSERT INTO agent_settings (agent_address) VALUES (${userAddress})
  `);
};

export const upsertAgentUser = async ({ address, displayName, username, bio }) => {
  await getDb().execute(sql`
    INSERT INTO users (address, verified, display_name, username, bio)
    VALUES (${address}, TRUE, ${displayName}, ${username}, ${bio || null})
    ON CONFLICT (address) DO UPDATE SET display_name = ${displayName}, username = COALESCE(users.username, ${username})
  `);
};

export const rotateApiKey = async (agentId, newHash, newPrefix) => {
  await getDb().execute(sql`
    UPDATE agents SET api_key_hash = ${newHash}, key_prefix = ${newPrefix}
    WHERE id = ${agentId}
  `);
};

// ─── Profile ────────────────────────────────────────────────────────────────

export const getProfile = async (address, { requirePublic = false } = {}) => {
  const publicFilter = requirePublic ? sql` AND a.is_public = true` : sql``;
  const [row] = await getDb().execute(sql`
    SELECT a.id, u.display_name AS name, u.bio, a.strategy_description, a.created_at, a.is_public
    FROM agents a
    JOIN users u ON u.address = a.user_address
    WHERE a.user_address = ${address}${publicFilter}
  `);
  return row || null;
};

export const getWithSettings = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT a.user_address, u.display_name AS name, u.bio,
           a.strategy_description, a.state_viewers, a.created_at,
           s.max_position_usd, s.max_leverage, s.allowed_coins,
           s.trade_enabled, s.min_confidence, s.preferred_timeframes, s.auto_predict, s.enabled_indicators
    FROM agents a
    JOIN users u ON u.address = a.user_address
    LEFT JOIN agent_settings s ON s.agent_address = a.user_address
    WHERE a.user_address = ${address} AND a.is_public = true
  `);
  return row || null;
};

export const getOwnerAndViewers = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT state_viewers FROM agents WHERE user_address = ${address}
  `);
  return row || null;
};

export const updateProfile = async (address, sqlUpdates) => {
  const setClause = sqlUpdates.reduce((a, b) => sql`${a}, ${b}`);
  await getDb().execute(sql`UPDATE agents SET ${setClause} WHERE user_address = ${address}`);
};

export const updateSettings = async (address, sqlUpdates) => {
  const db = getDb();
  // Ensure the row exists before updating (agents registered before the settings
  // row was auto-created on registration would otherwise silently lose their saves)
  await db.execute(sql`
    INSERT INTO agent_settings (agent_address) VALUES (${address}) ON CONFLICT DO NOTHING
  `);
  const setClause = sqlUpdates.reduce((a, b) => sql`${a}, ${b}`);
  await db.execute(sql`UPDATE agent_settings SET ${setClause} WHERE agent_address = ${address}`);
};

export const getStateViewers = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT state_viewers FROM agents WHERE user_address = ${address}
  `);
  return row?.state_viewers || [];
};

export const updateStateViewers = async (address, pgArray) => {
  await getDb().execute(sql`
    UPDATE agents SET state_viewers = ${pgArray}::text[] WHERE user_address = ${address}
  `);
};

// ─── Leaderboard ────────────────────────────────────────────────────────────

export const listPublicAgents = async () => {
  return getDb().execute(sql`
    SELECT a.id, u.display_name AS name, u.bio, u.avatar_url, a.user_address,
           a.strategy_description, a.created_at, u.username
    FROM agents a
    JOIN users u ON u.address = a.user_address
    WHERE true
  `);
};

export const getPublicAgentById = async (id) => {
  const [row] = await getDb().execute(sql`
    SELECT a.id, u.display_name AS name, u.bio, u.avatar_url, a.user_address,
           a.strategy_description, a.created_at,
           s.allowed_coins, s.max_leverage, s.max_position_usd
    FROM agents a
    JOIN users u ON u.address = a.user_address
    LEFT JOIN agent_settings s ON s.agent_address = a.user_address
    WHERE a.id = ${id} AND a.is_public = true
  `);
  return row || null;
};

export const getPublicAgentCount = async () => {
  const [row] = await getDb().execute(sql`SELECT COUNT(*)::int AS total FROM agents WHERE is_public = true`);
  return row?.total || 0;
};

// ─── Webhook info (for follow notifications) ────────────────────────────────

export const getAgentWebhookInfo = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT a.user_address
    FROM agents a WHERE a.user_address = ${address}
  `);
  return row || null;
};

// ─── Agent profile queries (agentSocial) ────────────────────────────────────

export const getAgentHomeProfile = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT u.display_name AS name, u.bio, u.avatar_url, u.follower_count, u.following_count,
           s.allowed_coins, s.max_leverage, s.max_position_usd, s.trade_enabled,
           s.min_confidence, s.preferred_timeframes, s.auto_predict, s.enabled_indicators
    FROM agents a
    JOIN users u ON u.address = a.user_address
    LEFT JOIN agent_settings s ON s.agent_address = a.user_address
    WHERE a.user_address = ${address}
    LIMIT 1
  `);
  return row || null;
};

export const getUserFollowerCount = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT follower_count FROM users WHERE address = ${address}
  `);
  return row?.follower_count || 0;
};

// Batch version — single query for all agents
export const getBatchFollowerCounts = async (addresses) => {
  if (!addresses.length) return {};
  const rows = await getDb().execute(sql`
    SELECT address, follower_count FROM users WHERE address IN (${sql.join(addresses.map(a => sql`${a}`), sql`, `)})
  `);
  return Object.fromEntries(rows.map(r => [r.address, r.follower_count || 0]));
};

export const getAgentPredictionAccuracy = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong
    FROM posts
    WHERE author_address = ${address}
      AND prediction_scored = true AND deleted_at IS NULL
  `);
  return row || { correct: 0, wrong: 0 };
};

// Batch version — single query for all agents
export const getBatchPredictionAccuracies = async (addresses) => {
  if (!addresses.length) return {};
  const rows = await getDb().execute(sql`
    SELECT author_address,
           COUNT(*) FILTER (WHERE prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE prediction_outcome = 'wrong')::int AS wrong
    FROM posts
    WHERE author_address IN (${sql.join(addresses.map(a => sql`${a}`), sql`, `)})
      AND prediction_scored = true AND deleted_at IS NULL
    GROUP BY author_address
  `);
  return Object.fromEntries(rows.map(r => [r.author_address, { correct: r.correct, wrong: r.wrong }]));
};

export const getAgentRank = async (followerCount) => {
  const [row] = await getDb().execute(sql`
    SELECT COUNT(*)::int + 1 AS rank
    FROM agents a2 JOIN users u2 ON u2.address = a2.user_address
    WHERE a2.is_public = true AND u2.follower_count > ${followerCount}
  `);
  return row?.rank || null;
};

export const getAgentPostForEvent = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT a.user_address FROM agents a WHERE a.user_address = ${address}
  `);
  return row || null;
};

// ─── My agents (whitelisted) ────────────────────────────────────────────────

export const listAgentsWhitelistingUser = async (userAddress) => {
  return getDb().execute(sql`
    SELECT a.user_address, u.display_name AS name, u.bio, a.strategy_description,
           u.avatar_url, u.follower_count,
           COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::int AS correct,
           COUNT(*) FILTER (WHERE p.prediction_outcome = 'wrong')::int AS wrong,
           COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::int AS total,
           ROUND(
             COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::numeric /
             NULLIF(COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric, 0) * 100, 1
           ) AS accuracy
    FROM agents a
    JOIN users u ON u.address = a.user_address
    LEFT JOIN posts p ON p.author_address = a.user_address
      AND p.prediction_coin IS NOT NULL AND p.prediction_scored = true AND p.deleted_at IS NULL
    WHERE true AND ${userAddress} = ANY(a.state_viewers)
    GROUP BY a.user_address, u.display_name, u.bio, a.strategy_description, u.avatar_url, u.follower_count
    ORDER BY u.follower_count DESC
  `);
};
