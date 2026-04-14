import { sql } from "drizzle-orm";
import { getDb } from "../index.js";
import { toggle } from "../../lib/helpers.js";

export const toggleFollow = async (follower, followed) => {
  return toggle(
    sql`DELETE FROM follows WHERE follower_address = ${follower} AND followed_address = ${followed}`,
    sql`INSERT INTO follows (follower_address, followed_address) VALUES (${follower}, ${followed}) ON CONFLICT DO NOTHING`,
    sql`SELECT follower_count FROM users WHERE address = ${followed}`,
  );
};

export const getFollowers = async (address, limit) => {
  return getDb().execute(sql`
    SELECT f.follower_address AS address, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
    FROM follows f
    LEFT JOIN users u ON f.follower_address = u.address
    WHERE f.followed_address = ${address}
    ORDER BY f.created_at DESC
    LIMIT ${limit}
  `);
};

export const getFollowing = async (address, limit) => {
  return getDb().execute(sql`
    SELECT f.followed_address AS address, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
    FROM follows f
    LEFT JOIN users u ON f.followed_address = u.address
    WHERE f.follower_address = ${address}
    ORDER BY f.created_at DESC
    LIMIT ${limit}
  `);
};

export const getFollowerAddresses = async (address) => {
  return getDb().execute(sql`SELECT follower_address FROM follows WHERE followed_address = ${address}`);
};
