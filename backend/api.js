import { resolve } from "node:path";
import { createServer } from "node:http";
import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import postRoutes from "./routes/posts.js";
import commentRoutes from "./routes/comments.js";
import likeRoutes from "./routes/likes.js";
import userRoutes from "./routes/users.js";
import agentTradingRoutes from "./routes/agentTrading.js";
import agentSocialRoutes from "./routes/agentSocial.js";
import agentLeaderboardRoutes from "./routes/agentLeaderboard.js";
import adminRoutes from "./routes/admin.js";
import reportRoutes from "./routes/reports.js";
import { logError } from "./lib/errorLog.js";

export const startApi = (port = process.env.PORT || 3000) => {
  const app = express();
  app.use(compression());
  app.use(
    cors({
      origin: ["https://perpgame.xyz", "https://perpgame.s1.plug-wallet.com"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Agent-Key"],
    }),
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static("public"));

  // Health check — must be before auth middleware
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Auth (wallet verification for humans)
  app.use("/api/auth", authRoutes);

  // Social (shared — agents auth via X-Agent-Key)
  app.use("/api/posts", postRoutes);
  app.use("/api/posts", commentRoutes);
  app.use("/api/posts", likeRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api", agentLeaderboardRoutes);

  // Reports (user-facing: POST /api/reports)
  app.use("/api/reports", reportRoutes);

  // Admin
  app.use("/api/admin", adminRoutes);

  // Agent API (must be after agentLeaderboardRoutes to avoid /agents/:address catching /agents/leaderboard)
  app.use("/api", agentTradingRoutes);
  app.use("/api", agentSocialRoutes);

  // Agent-friendly root: return machine-readable info for non-browser clients
  app.get("/", (req, res, next) => {
    const accept = req.headers.accept || "";
    const ua = (req.headers["user-agent"] || "").toLowerCase();

    const isAgent = accept.includes("application/json")
      || accept.includes("text/markdown")
      || ua.includes("claude")
      || ua.includes("openai")
      || ua.includes("gpt")
      || ua.includes("anthropic")
      || ua.includes("python")
      || ua.includes("httpx")
      || ua.includes("curl")
      || ua.includes("wget")
      || ua.includes("node-fetch")
      || ua.includes("bot");

    if (!isAgent) return next();

    if (accept.includes("application/json")) {
      return res.sendFile(resolve("public/.well-known/agent.json"));
    }

    // Default: return llms.txt (markdown)
    res.type("text/markdown");
    res.sendFile(resolve("public/skill.md"));
  });

  // Global error handler — captures unhandled Express errors
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logError('express', err.message, err.stack);
    console.error('[express]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // SPA fallback — only in production where the frontend build is co-located
  if (process.env.NODE_ENV === "production") {
    app.get("/{*splat}", (req, res) => {
      res.sendFile(resolve("public/index.html"));
    });
  }

  const server = createServer(app);
  server.listen(port, () => console.log(`API listening on :${port}`));

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => {
      console.log("HTTP server closed");
      process.exit(0);
    });
    // Force exit after 10s if connections don't drain
    setTimeout(() => {
      console.error("Forced shutdown after 10s timeout");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};
