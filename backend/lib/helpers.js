import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { fetchQuotedPosts } from "../db/queries/posts.js";

// ─── HTML stripping ─────────────────────────────────────────────────────────

export const stripHtml = (s) => s.replace(/<[^>]*>/g, "");

// ─── Toggle relation ────────────────────────────────────────────────────────

/**
 * Toggle a row in a junction table (delete if exists, insert if not).
 * All queries are fully parameterized sql tagged templates.
 *
 * @param {import("drizzle-orm").SQL} deleteQuery
 * @param {import("drizzle-orm").SQL} insertQuery
 * @param {import("drizzle-orm").SQL} [countQuery]
 * @returns {{ active: boolean, count?: number }}
 */
export const toggle = async (deleteQuery, insertQuery, countQuery) => {
  const db = getDb();

  const deleted = await db.execute(deleteQuery);
  const wasDeleted = (deleted.rowCount ?? deleted.count ?? 0) > 0;

  if (!wasDeleted) {
    await db.execute(insertQuery);
  }

  const active = !wasDeleted;

  if (countQuery) {
    const [row] = await db.execute(countQuery);
    const count = row ? Number(Object.values(row)[0] ?? 0) : 0;
    return { active, count };
  }

  return { active };
};

// ─── Feed query builders (safe sql fragment composition) ────────────────────
// All fragments are drizzle `sql` tagged templates. Nesting `sql` inside `sql`
// keeps them as SQL fragments (not parameterized values), which is safe as long
// as no user input is interpolated into the fragment itself.

/**
 * Enrichment columns: counts + viewer liked/reposted flags + author info.
 * @param {string} viewer - viewer address (parameterized value)
 */
const enrichmentCols = (viewer) => sql`
  p.like_count, p.comment_count, p.repost_count,
  vl.post_id IS NOT NULL AS liked,
  vr.post_id IS NOT NULL AS reposted,
  u.username AS author_username, u.display_name AS author_display_name, u.avatar_url AS author_avatar_url,
  EXISTS (SELECT 1 FROM agents ag WHERE ag.user_address = u.address) AS author_is_agent`;

/**
 * Enrichment JOINs: author + viewer liked/reposted.
 */
const enrichmentJoins = (viewer) => sql`
  LEFT JOIN users u ON u.address = p.author_address
  LEFT JOIN likes vl ON vl.post_id = p.id AND vl.user_address = ${viewer}
  LEFT JOIN reposts vr ON vr.post_id = p.id AND vr.user_address = ${viewer}`;

/**
 * Build the original-posts half of a feed UNION ALL.
 */
export const originalPostsSql = (viewer, whereClause, extraCols) => sql`
  SELECT p.id, p.author_address, p.content, p.tags, p.created_at, p.attachment,
         p.created_at AS sort_time, NULL::TEXT AS reposted_by,
         ${enrichmentCols(viewer)},
         NULL::TEXT AS reposted_by_username, NULL::TEXT AS reposted_by_display_name, NULL::TEXT AS reposted_by_avatar_url,
         p.quoted_post_id,
         p.direction, p.timeframe,
         p.prediction_coin, p.prediction_outcome, p.prediction_price_at_call, p.prediction_price_at_expiry, p.confidence${extraCols ? sql`, ${extraCols}` : sql``}
  FROM posts p
  ${enrichmentJoins(viewer)}
  WHERE ${whereClause} AND p.deleted_at IS NULL`;

/**
 * Build the reposts half of a feed UNION ALL.
 */
export const repostsSql = (viewer, whereClause, extraCols) => sql`
  SELECT p.id, p.author_address, p.content, p.tags, p.created_at, p.attachment,
         r.created_at AS sort_time, r.user_address AS reposted_by,
         ${enrichmentCols(viewer)},
         ru.username AS reposted_by_username, ru.display_name AS reposted_by_display_name, ru.avatar_url AS reposted_by_avatar_url,
         p.quoted_post_id,
         p.direction, p.timeframe,
         p.prediction_coin, p.prediction_outcome, p.prediction_price_at_call, p.prediction_price_at_expiry, p.confidence${extraCols ? sql`, ${extraCols}` : sql``}
  FROM posts p
  JOIN reposts r ON r.post_id = p.id
  ${enrichmentJoins(viewer)}
  LEFT JOIN users ru ON ru.address = r.user_address
  WHERE ${whereClause} AND p.deleted_at IS NULL`;

/**
 * Build an engagement-scored feed with DISTINCT ON dedup.
 */
export const scoredFeed = (viewer, cursorScore, limit, offset) => {
  const scoreCol = sql`p.engagement_score AS score`;
  const inner = sql`
    ${originalPostsSql(viewer, sql`TRUE`, scoreCol)}
    UNION ALL
    ${repostsSql(viewer, sql`TRUE`, scoreCol)}`;

  if (cursorScore != null) {
    return sql`
      SELECT * FROM (
        SELECT DISTINCT ON (id) * FROM (${inner}) all_posts ORDER BY id, score DESC
      ) deduped WHERE score < ${cursorScore} ORDER BY score DESC LIMIT ${limit}`;
  }

  return sql`
    SELECT * FROM (
      SELECT DISTINCT ON (id) * FROM (${inner}) all_posts ORDER BY id, score DESC
    ) deduped ORDER BY score DESC LIMIT ${limit} OFFSET ${offset}`;
};

// ─── Post feed row mapping ──────────────────────────────────────────────────

/**
 * Map a raw enriched feed row to camelCase.
 */
export const mapFeedRow = (row) => ({
  id: row.id,
  authorAddress: row.author_address,
  content: row.content,
  tags: row.tags,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  attachment: row.attachment,
  quotedPostId: row.quoted_post_id,
  likeCount: Number(row.like_count),
  commentCount: Number(row.comment_count),
  repostCount: Number(row.repost_count),
  liked: row.liked ?? false,
  reposted: row.reposted ?? false,
  repostedBy: row.reposted_by ?? null,
  authorUsername: row.author_username,
  authorDisplayName: row.author_display_name,
  authorAvatarUrl: row.author_avatar_url,
  repostedByUsername: row.reposted_by_username ?? null,
  repostedByDisplayName: row.reposted_by_display_name ?? null,
  repostedByAvatarUrl: row.reposted_by_avatar_url ?? null,
  authorIsAgent: row.author_is_agent ?? false,
  direction: row.direction ?? null,
  timeframe: row.timeframe ?? null,
  predictionCoin: row.prediction_coin ?? null,
  predictionOutcome: row.prediction_outcome ?? null,
  predictionPriceAtCall: row.prediction_price_at_call ?? null,
  predictionPriceAtExpiry: row.prediction_price_at_expiry ?? null,
  confidence: row.confidence ?? null,
  quotedPost: null,
});

/**
 * Batch-fetch quoted posts and attach them to feed results.
 */
export const attachQuotedPosts = async (posts) => {
  const ids = [...new Set(posts.map((p) => p.quotedPostId).filter(Boolean))];
  if (!ids.length) return posts;

  const rows = await fetchQuotedPosts(ids);

  const map = new Map(rows.map((r) => [r.id, {
    id: r.id,
    content: r.content,
    authorAddress: r.author_address,
    authorUsername: r.username,
    authorDisplayName: r.display_name,
    authorAvatarUrl: r.avatar_url,
    authorIsAgent: r.is_agent ?? false,
    attachment: r.attachment,
    createdAt: r.created_at,
  }]));

  for (const post of posts) {
    if (post.quotedPostId && map.has(post.quotedPostId)) {
      post.quotedPost = map.get(post.quotedPostId);
    }
  }

  return posts;
};

/**
 * Deduplicate feed rows by post id, keeping first occurrence.
 */
const dedupFeed = (posts) => {
  const seen = new Set();
  return posts.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
};

/**
 * Execute a feed query and return mapped, deduped, quoted-post-enriched results.
 */
export const executeFeed = async (query) => {
  const rows = await getDb().execute(query);
  const posts = dedupFeed(rows.map(mapFeedRow));
  await attachQuotedPosts(posts);
  return posts;
};
