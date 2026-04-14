import { sql } from "drizzle-orm";
import { getDb } from "../index.js";
import { toggle } from "../../lib/helpers.js";

export const listComments = async ({ postId, viewer, cursor, limit }) => {
  const db = getDb();
  if (cursor) {
    return db.execute(sql`
      SELECT c.id, c.post_id AS "postId", c.author_address AS "authorAddress", c.content,
             c.created_at AS "createdAt", u.username AS "authorUsername", u.avatar_url AS "authorAvatarUrl",
             u.display_name AS "authorDisplayName", c.like_count AS "likeCount",
             c.parent_comment_id AS "parentCommentId",
             CASE WHEN cl.user_address IS NOT NULL THEN TRUE ELSE FALSE END AS liked,
             COALESCE(rc.cnt, 0)::int AS "replyCount"
      FROM comments c
      LEFT JOIN users u ON c.author_address = u.address
      LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_address = ${viewer}
      LEFT JOIN (
        SELECT parent_comment_id, COUNT(*) AS cnt FROM comments
        WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY parent_comment_id
      ) rc ON rc.parent_comment_id = c.id
      WHERE c.post_id = ${postId} AND c.parent_comment_id IS NULL AND c.deleted_at IS NULL
        AND c.created_at > (SELECT created_at FROM comments WHERE id = ${cursor})
      ORDER BY c.created_at ASC
      LIMIT ${limit}
    `);
  }
  return db.execute(sql`
    SELECT c.id, c.post_id AS "postId", c.author_address AS "authorAddress", c.content,
           c.created_at AS "createdAt", u.username AS "authorUsername", u.avatar_url AS "authorAvatarUrl",
           u.display_name AS "authorDisplayName", c.like_count AS "likeCount",
           c.parent_comment_id AS "parentCommentId",
           CASE WHEN cl.user_address IS NOT NULL THEN TRUE ELSE FALSE END AS liked,
           COALESCE(rc.cnt, 0)::int AS "replyCount"
    FROM comments c
    LEFT JOIN users u ON c.author_address = u.address
    LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_address = ${viewer}
    LEFT JOIN (
      SELECT parent_comment_id, COUNT(*) AS cnt FROM comments
      WHERE parent_comment_id IS NOT NULL AND deleted_at IS NULL
      GROUP BY parent_comment_id
    ) rc ON rc.parent_comment_id = c.id
    WHERE c.post_id = ${postId} AND c.parent_comment_id IS NULL AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT ${limit}
  `);
};

export const insertComment = async ({ id, postId, authorAddress, content, parentCommentId }) => {
  await getDb().execute(sql`
    INSERT INTO comments (id, post_id, author_address, content, parent_comment_id)
    VALUES (${id}, ${postId}, ${authorAddress}, ${content}, ${parentCommentId || null})
  `);
};

export const getCommentById = async (id) => {
  const [row] = await getDb().execute(sql`
    SELECT c.id, c.post_id AS "postId", c.author_address AS "authorAddress", c.content,
           c.created_at AS "createdAt", u.username AS "authorUsername", u.display_name AS "authorDisplayName",
           u.avatar_url AS "authorAvatarUrl", c.like_count AS "likeCount", c.parent_comment_id AS "parentCommentId"
    FROM comments c
    LEFT JOIN users u ON c.author_address = u.address
    WHERE c.id = ${id}
  `);
  return row || null;
};

export const getCommentParent = async (commentId) => {
  const [row] = await getDb().execute(sql`SELECT post_id FROM comments WHERE id = ${commentId}`);
  return row || null;
};

export const softDeleteComment = async (commentId, authorAddress) => {
  const result = await getDb().execute(sql`
    UPDATE comments SET deleted_at = NOW() WHERE id = ${commentId} AND author_address = ${authorAddress} AND deleted_at IS NULL
  `);
  return (result.rowCount ?? result.count ?? 0) > 0;
};

export const listReplies = async ({ parentCommentId, viewer, limit }) => {
  return getDb().execute(sql`
    SELECT c.id, c.post_id AS "postId", c.author_address AS "authorAddress", c.content,
           c.created_at AS "createdAt", u.username AS "authorUsername", u.avatar_url AS "authorAvatarUrl",
           u.display_name AS "authorDisplayName", c.like_count AS "likeCount",
           c.parent_comment_id AS "parentCommentId",
           CASE WHEN cl.user_address IS NOT NULL THEN TRUE ELSE FALSE END AS liked,
           0::int AS "replyCount"
    FROM comments c
    LEFT JOIN users u ON c.author_address = u.address
    LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_address = ${viewer}
    WHERE c.parent_comment_id = ${parentCommentId} AND c.deleted_at IS NULL
    ORDER BY c.created_at ASC
    LIMIT ${limit}
  `);
};

export const toggleCommentLike = async (commentId, userAddress) => {
  return toggle(
    sql`DELETE FROM comment_likes WHERE comment_id = ${commentId} AND user_address = ${userAddress}`,
    sql`INSERT INTO comment_likes (comment_id, user_address) VALUES (${commentId}, ${userAddress}) ON CONFLICT DO NOTHING`,
    sql`SELECT like_count FROM comments WHERE id = ${commentId}`,
  );
};

export const verifyPostExists = async (postId) => {
  const [row] = await getDb().execute(sql`
    SELECT id, author_address FROM posts WHERE id = ${postId} AND deleted_at IS NULL
  `);
  return row || null;
};
