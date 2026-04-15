import { Router } from "express";
import { randomUUID } from "node:crypto";
import { optionalAuth } from "../auth/middleware.js";
import { insertReport } from "../db/queries/reports.js";

const router = Router();

const VALID_TARGET_TYPES = ["post", "comment"];
const VALID_REASONS = ["spam", "harassment", "scam", "other"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/reports — Submit a content report
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { targetType, targetId, reason, detail } = req.body;

    if (!VALID_TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({ error: "Invalid target type" });
    }
    if (!UUID_RE.test(targetId)) {
      return res.status(400).json({ error: "Invalid target id" });
    }
    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ error: "Invalid reason" });
    }
    if (detail != null && (typeof detail !== "string" || detail.length > 500)) {
      return res.status(400).json({ error: "Detail must be a string under 500 characters" });
    }

    await insertReport({
      id: randomUUID(),
      reporterAddress: req.userAddress || null,
      targetType,
      targetId,
      reason,
      detail: detail || null,
    });

    res.json({ ok: true });
  } catch (err) {
    if (err.message?.includes("duplicate key") || err.code === "23505") {
      return res.status(409).json({ error: "You have already reported this content." });
    }
    console.error("[Reports] POST /reports error:", err.message);
    res.status(500).json({ error: "Failed to submit report" });
  }
});

export default router;
