import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth, optionalAuth } from "../auth/middleware.js";
import { stripHtml } from "../lib/helpers.js";
import {
  listComments, insertComment, getCommentById, getCommentParent,
  softDeleteComment, listReplies, toggleCommentLike,
} from "../db/queries/comments.js";

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /posts/:postId/comments
router.get("/:postId/comments", optionalAuth, async (req, res) => {
  const { postId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { cursor } = req.query;
  const viewer = req.userAddress || "";

  if (cursor && !UUID_RE.test(cursor)) {
    return res.status(400).json({ error: "Invalid cursor" });
  }

  const rows = await listComments({ postId, viewer, cursor, limit });
  res.json(rows);
});

// POST /posts/:postId/comments
router.post("/:postId/comments", requireAuth, async (req, res) => {
  const { postId } = req.params;
  const { parentCommentId } = req.body;
  const content = stripHtml(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Comment content cannot be empty" });
  if (content.length > 2000) return res.status(400).json({ error: "Comment content too long (max 2000)" });

  const addr = req.userAddress;

  // Validate parent comment belongs to same post
  if (parentCommentId) {
    const parent = await getCommentParent(parentCommentId);
    if (!parent) return res.status(404).json({ error: "Parent comment not found" });
    if (parent.post_id !== postId) return res.status(400).json({ error: "Cannot reply to a comment on a different post" });
  }

  const id = randomUUID();
  try {
    await insertComment({ id, postId, authorAddress: addr, content, parentCommentId });
  } catch (err) {
    if (err.code === "23503") return res.status(404).json({ error: "Post not found" });
    throw err;
  }

  const comment = await getCommentById(id);

  res.status(201).json({ ...comment, liked: false, replyCount: 0 });
});

// DELETE /posts/:postId/comments/:commentId
router.delete("/:postId/comments/:commentId", requireAuth, async (req, res) => {
  const { commentId } = req.params;
  const deleted = await softDeleteComment(commentId, req.userAddress);
  if (!deleted) {
    return res.status(404).json({ error: "Comment not found or not owned by you" });
  }
  res.json({ deleted: true });
});

// GET /posts/:postId/comments/:commentId/replies
router.get("/:postId/comments/:commentId/replies", optionalAuth, async (req, res) => {
  const { commentId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const viewer = req.userAddress || "";

  const rows = await listReplies({ parentCommentId: commentId, viewer, limit });
  res.json(rows);
});

// POST /posts/:postId/comments/:commentId/like
router.post("/:postId/comments/:commentId/like", requireAuth, async (req, res) => {
  const { commentId } = req.params;
  const addr = req.userAddress;

  try {
    const { active, count } = await toggleCommentLike(commentId, addr);
    res.json({ liked: active, likeCount: count });
  } catch (err) {
    if (err.code === "23503") return res.status(404).json({ error: "Comment not found" });
    throw err;
  }
});

export default router;
