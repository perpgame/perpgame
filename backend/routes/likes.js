import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { toggleLike, listPostLikers } from "../db/queries/likes.js";

const router = Router();

// POST /posts/:postId/like
router.post("/:postId/like", requireAuth, async (req, res) => {
  const { postId } = req.params;
  const addr = req.userAddress;

  try {
    const { active, count } = await toggleLike(postId, addr);
    res.json({ liked: active, likeCount: count });
  } catch (err) {
    if (err.code === "23503") return res.status(404).json({ error: "Post not found" });
    throw err;
  }
});

// GET /posts/:postId/likes
router.get("/:postId/likes", async (req, res) => {
  const { postId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const rows = await listPostLikers(postId, limit);
  res.json(rows);
});

export default router;
