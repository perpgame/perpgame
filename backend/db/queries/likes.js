import { sql } from "drizzle-orm";
import { getDb } from "../index.js";
import { toggle } from "../../lib/helpers.js";

export const toggleLike = async (postId, userAddress) => {
  return toggle(
    sql`DELETE FROM likes WHERE post_id = ${postId} AND user_address = ${userAddress}`,
    sql`INSERT INTO likes (post_id, user_address) VALUES (${postId}, ${userAddress}) ON CONFLICT DO NOTHING`,
    sql`SELECT like_count FROM posts WHERE id = ${postId}`,
  );
};

export const listPostLikers = async (postId, limit) => {
  return getDb().execute(sql`
    SELECT l.user_address AS address, u.username, u.display_name AS "displayName", u.avatar_url AS "avatarUrl"
    FROM likes l
    LEFT JOIN users u ON l.user_address = u.address
    WHERE l.post_id = ${postId}
    ORDER BY l.created_at DESC
    LIMIT ${limit}
  `);
};
