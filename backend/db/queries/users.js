import { sql, eq } from "drizzle-orm";
import { getDb } from "../index.js";
import { users } from "../schema.js";

export const getVerifiedCount = async () => {
  const [row] = await getDb().execute(sql`SELECT COUNT(*)::int AS count FROM users WHERE verified = TRUE`);
  return row?.count ?? 0;
};

export const searchUsers = async ({ query, limit }) => {
  const pattern = `${query.slice(0, 100).toLowerCase()}%`;
  return getDb().execute(sql`
    SELECT u.address, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl",
           (a.user_address IS NOT NULL) AS "isAgent"
    FROM users u
    LEFT JOIN agents a ON a.user_address = u.address
    WHERE LOWER(u.address) LIKE ${pattern}
      OR u.username ILIKE ${pattern}
      OR u.display_name ILIKE ${pattern}
    ORDER BY u.username ASC NULLS LAST
    LIMIT ${limit}
  `);
};

export const getUserByAddressOrUsername = async (addr) => {
  const [row] = await getDb().execute(sql`
    SELECT u.address, u.joined_at AS "joinedAt", u.verified, u.username, u.bio,
           u.avatar_url AS "avatarUrl", u.display_name AS "displayName",
           u.follower_count AS "followerCount", u.following_count AS "followingCount",
           (a.user_address IS NOT NULL) AS "isAgent"
    FROM users u
    LEFT JOIN agents a ON a.user_address = u.address
    WHERE u.address = ${addr} OR u.username = ${addr}
  `);
  return row || null;
};

export const getUserStats = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM posts WHERE author_address = ${address} AND deleted_at IS NULL) AS "postCount",
      u.follower_count AS "followerCount",
      u.following_count AS "followingCount",
      (SELECT COUNT(*)::int FROM likes l JOIN posts p ON l.post_id = p.id WHERE p.author_address = ${address}) AS "totalLikesReceived"
    FROM users u WHERE u.address = ${address}
  `);
  return row || null;
};

export const getUserPredictionStats = async (address, since = null) => {
  const sinceFilter = since ? sql`AND p.created_at >= ${since}` : sql``;
  const [row] = await getDb().execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::int AS correct,
      COUNT(*) FILTER (WHERE p.prediction_outcome = 'wrong')::int AS wrong,
      COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::int AS total,
      COUNT(*) FILTER (WHERE p.prediction_scored = false AND p.prediction_expires_at IS NOT NULL)::int AS pending,
      ROUND(
        COUNT(*) FILTER (WHERE p.prediction_outcome = 'correct')::numeric /
        NULLIF(COUNT(*) FILTER (WHERE p.prediction_outcome IN ('correct','wrong'))::numeric, 0) * 100, 1
      ) AS accuracy
    FROM users u
    LEFT JOIN posts p ON p.author_address = u.address
      AND p.prediction_coin IS NOT NULL
      AND p.direction IS NOT NULL
      AND p.deleted_at IS NULL
      ${sinceFilter}
    WHERE u.address = ${address}
  `);
  return row || null;
};

export const upsertOnLogin = async (address) => {
  await getDb().execute(sql`
    INSERT INTO users (address, verified) VALUES (${address}, TRUE)
    ON CONFLICT (address) DO UPDATE SET verified = TRUE
  `);
};

export const getUserByAddress = async (address) => {
  const [row] = await getDb().select().from(users).where(eq(users.address, address));
  return row || null;
};

export const ensureUserExists = async (address) => {
  await getDb().execute(sql`INSERT INTO users (address) VALUES (${address}) ON CONFLICT DO NOTHING`);
};

export const getUserBasicInfo = async (address) => {
  const [row] = await getDb().execute(sql`
    SELECT username, display_name FROM users WHERE address = ${address}
  `);
  return row || null;
};

export const checkUsernameExists = async (username) => {
  const [row] = await getDb().execute(sql`
    SELECT 1 FROM users WHERE username = ${username} LIMIT 1
  `);
  return !!row;
};

export const updateUserFields = async (address, sqlUpdates) => {
  const setClause = sqlUpdates.reduce((a, b) => sql`${a}, ${b}`);
  await getDb().execute(sql`UPDATE users SET ${setClause} WHERE address = ${address}`);
};

