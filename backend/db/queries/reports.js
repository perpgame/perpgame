import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export const getPostAuthor = async (postId) => {
  const [row] = await getDb().execute(sql`SELECT author_address FROM posts WHERE id = ${postId}`);
  return row?.author_address || null;
};

export const getCommentAuthor = async (commentId) => {
  const [row] = await getDb().execute(sql`SELECT author_address FROM comments WHERE id = ${commentId}`);
  return row?.author_address || null;
};

export const insertReport = async ({ id, reporterAddress, targetType, targetId, reason, detail }) => {
  await getDb().execute(sql`
    INSERT INTO reports (id, reporter_address, target_type, target_id, reason, detail)
    VALUES (${id}, ${reporterAddress}, ${targetType}, ${targetId}, ${reason}, ${detail || null})
  `);
};

export const listReports = async ({ status, limit }) => {
  return getDb().execute(sql`
    SELECT r.id, r.reporter_address AS "reporterAddress", r.target_type AS "targetType",
           r.target_id AS "targetId", r.reason, r.detail, r.status,
           r.created_at AS "createdAt", r.resolved_by AS "resolvedBy", r.resolved_at AS "resolvedAt",
           COALESCE(LEFT(p.content, 200), LEFT(c.content, 200)) AS "contentPreview",
           COALESCE(p.author_address, c.author_address) AS "authorAddress"
    FROM reports r
    LEFT JOIN posts p ON r.target_type = 'post' AND r.target_id = p.id
    LEFT JOIN comments c ON r.target_type = 'comment' AND r.target_id = c.id
    WHERE r.status = ${status}
    ORDER BY r.created_at DESC
    LIMIT ${limit}
  `);
};

export const resolveReport = async (reportId, resolverAddress, status) => {
  const result = await getDb().execute(sql`
    UPDATE reports SET status = ${status}, resolved_by = ${resolverAddress}, resolved_at = NOW()
    WHERE id = ${reportId} AND status = 'pending'
  `);
  return (result.rowCount ?? 0) > 0;
};
