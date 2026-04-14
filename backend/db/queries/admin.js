import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export const listLikes = async ({ limit }) => {
  return getDb().execute(sql`
    SELECT post_id AS post_id, user_address, created_at
    FROM likes ORDER BY created_at DESC LIMIT ${limit}
  `);
};

export const listFollows = async ({ limit }) => {
  return getDb().execute(sql`
    SELECT follower_address, followed_address, created_at
    FROM follows ORDER BY created_at DESC LIMIT ${limit}
  `);
};

export const getStats = async () => {
  const [row] = await getDb().execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM posts) AS posts,
      (SELECT COUNT(*)::int FROM comments) AS comments,
      (SELECT COUNT(*)::int FROM likes) AS likes,
      (SELECT COUNT(*)::int FROM follows) AS follows,
      (SELECT COUNT(*)::int FROM reports WHERE status = 'pending') AS reports
  `);
  return row;
};

export const listUsers = async ({ cursor, limit }) => {
  const db = getDb();
  if (cursor) {
    return db.execute(sql`
      SELECT address, joined_at AS "joinedAt", verified FROM users
      WHERE joined_at < (SELECT joined_at FROM users WHERE address = ${cursor})
      ORDER BY joined_at DESC LIMIT ${limit}
    `);
  }
  return db.execute(sql`
    SELECT address, joined_at AS "joinedAt", verified FROM users
    ORDER BY joined_at DESC LIMIT ${limit}
  `);
};

export const listPosts = async ({ cursor, limit }) => {
  const db = getDb();
  if (cursor) {
    return db.execute(sql`
      SELECT p.id, p.author_address AS "authorAddress", p.content, p.tags,
             p.created_at AS "createdAt", p.attachment, p.like_count AS "likeCount", p.comment_count AS "commentCount"
      FROM posts p
      WHERE p.created_at < (SELECT created_at FROM posts WHERE id = ${cursor})
      ORDER BY p.created_at DESC LIMIT ${limit}
    `);
  }
  return db.execute(sql`
    SELECT p.id, p.author_address AS "authorAddress", p.content, p.tags,
           p.created_at AS "createdAt", p.attachment, p.like_count AS "likeCount", p.comment_count AS "commentCount"
    FROM posts p ORDER BY p.created_at DESC LIMIT ${limit}
  `);
};

export const listAdminComments = async ({ cursor, limit }) => {
  const db = getDb();
  if (cursor) {
    return db.execute(sql`
      SELECT id, post_id AS "postId", author_address AS "authorAddress", content, created_at AS "createdAt"
      FROM comments
      WHERE created_at < (SELECT created_at FROM comments WHERE id = ${cursor})
      ORDER BY created_at DESC LIMIT ${limit}
    `);
  }
  return db.execute(sql`
    SELECT id, post_id AS "postId", author_address AS "authorAddress", content, created_at AS "createdAt"
    FROM comments ORDER BY created_at DESC LIMIT ${limit}
  `);
};
