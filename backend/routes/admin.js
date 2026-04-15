import { Router } from "express";
import { requireAdmin } from "../auth/middleware.js";
import { getStats, listUsers, listPosts, listAdminComments, listLikes, listFollows } from "../db/queries/admin.js";
import { listReports, resolveReport } from "../db/queries/reports.js";
import { revokeAllUserTokens } from "../db/queries/revokedTokens.js";
import { getDb } from "../db/index.js";
import { sql } from "drizzle-orm";
import { getErrors, clearErrors } from "../lib/errorLog.js";

const router = Router();

// GET /admin/stats
router.get("/stats", requireAdmin, async (_req, res) => {
  const row = await getStats();
  res.json(row);
});

// GET /admin/users
router.get("/users", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { cursor } = req.query;
  const rows = await listUsers({ cursor, limit });
  res.json(rows);
});

// GET /admin/posts
router.get("/posts", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { cursor } = req.query;
  const rows = await listPosts({ cursor, limit });
  res.json(rows);
});

// GET /admin/comments
router.get("/comments", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { cursor } = req.query;
  const rows = await listAdminComments({ cursor, limit });
  res.json(rows);
});

// GET /admin/likes
router.get("/likes", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await listLikes({ limit });
  res.json(rows);
});

// GET /admin/follows
router.get("/follows", requireAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await listFollows({ limit });
  res.json(rows);
});

// GET /admin/reports
router.get("/reports", requireAdmin, async (req, res) => {
  const status = req.query.status || "pending";
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = await listReports({ status, limit });
  res.json(rows);
});

// POST /admin/reports/:id/resolve
router.post("/reports/:id/resolve", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, deleteContent } = req.body;
  if (!["resolved", "dismissed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  if (deleteContent) {
    // Find the report to determine what to delete
    const [report] = await getDb().execute(sql`SELECT target_type, target_id FROM reports WHERE id = ${id}`);
    if (report) {
      // Validate target_type is a known safe value before executing deletion
      const ALLOWED_TARGET_TYPES = ["post", "comment"];
      if (!ALLOWED_TARGET_TYPES.includes(report.target_type)) {
        return res.status(400).json({ error: "Invalid report target type" });
      }
      // Validate target_id is a non-empty string (UUID format)
      if (!report.target_id || typeof report.target_id !== "string" || !/^[0-9a-f-]{36}$/i.test(report.target_id)) {
        return res.status(400).json({ error: "Invalid report target id" });
      }
      if (report.target_type === "post") {
        await getDb().execute(sql`UPDATE posts SET deleted_at = NOW() WHERE id = ${report.target_id}`);
      } else if (report.target_type === "comment") {
        await getDb().execute(sql`UPDATE comments SET deleted_at = NOW() WHERE id = ${report.target_id}`);
      }
    }
  }

  const updated = await resolveReport(id, req.userAddress, status);
  if (!updated) return res.status(404).json({ error: "Report not found or already resolved" });

  console.log(`AUDIT: Admin ${req.userAddress} resolved report ${id} as ${status} (deleteContent=${deleteContent})`);
  res.json({ ok: true });
});

// GET /admin/error-logs
router.get("/error-logs", requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(getErrors({ limit }));
});

// DELETE /admin/error-logs
router.delete("/error-logs", requireAdmin, (_req, res) => {
  clearErrors();
  res.json({ ok: true });
});

// POST /admin/revoke-user/:address
router.post("/revoke-user/:address", requireAdmin, async (req, res) => {
  const address = req.params.address.toLowerCase();
  const revoked = await revokeAllUserTokens(address);
  console.log(`AUDIT: Admin ${req.userAddress} revoked all tokens for user ${address}`);
  res.json({ ok: true, address, revoked });
});

export default router;
