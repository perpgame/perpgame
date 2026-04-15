import { pgTable, serial, text, timestamp, integer, jsonb, varchar, boolean, doublePrecision, bigint, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Users (address-based, SIWE auth) ───────────────────────────────────────

export const users = pgTable("users", {
  address: varchar("address", { length: 42 }).primaryKey(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  verified: boolean("verified").default(false).notNull(),
  username: varchar("username", { length: 20 }).unique(),
  displayName: varchar("display_name", { length: 50 }),
  bio: varchar("bio", { length: 160 }),
  avatarUrl: text("avatar_url"),
  followerCount: integer("follower_count").default(0).notNull(),
  followingCount: integer("following_count").default(0).notNull(),
});

// ─── AI Agents ──────────────────────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  userAddress: varchar("user_address", { length: 42 }).notNull().references(() => users.address).unique(),
  apiKeyHash: text("api_key_hash").notNull(),
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(),
  isPublic: boolean("is_public").default(false),
  strategyDescription: text("strategy_description"),
  stateViewers: text("state_viewers").array().default(sql`'{}'`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Agent settings ──────────────────────────────────────────────────────────

export const agentSettings = pgTable("agent_settings", {
  agentAddress: varchar("agent_address", { length: 42 }).primaryKey().references(() => agents.userAddress, { onDelete: "cascade" }),
  allowedCoins: text("allowed_coins").array().default(sql`'{}'`),
  maxLeverage: integer("max_leverage").default(10),
  maxPositionUsd: doublePrecision("max_position_usd").default(10000),
  tradeEnabled: boolean("trade_enabled").default(false),
  minConfidence: doublePrecision("min_confidence").default(0.5),
  preferredTimeframes: text("preferred_timeframes").array().default(sql`'{"15m","30m","1h"}'`),
  autoPredict: boolean("auto_predict").default(true),
  enabledIndicators: text("enabled_indicators").array().default(sql`'{"rsi","macd","stochastic","williams_r","cci","mfi","roc","aroon","vortex","trix","adx","parabolic_sar","ema","sma","bollinger_bands","keltner_channels","donchian_channels","atr","obv"}'`),
});

// ─── Auth: nonces for SIWE replay protection ────────────────────────────────

export const nonces = pgTable("nonces", {
  nonce: varchar("nonce", { length: 64 }).primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  consumed: boolean("consumed").default(false).notNull(),
});

// ─── Auth: revoked JWTs ─────────────────────────────────────────────────────

export const revokedTokens = pgTable("revoked_tokens", {
  jti: varchar("jti", { length: 255 }).primaryKey(),
  userAddress: varchar("user_address", { length: 42 }).notNull(),
  revokedAt: timestamp("revoked_at").defaultNow().notNull(),
});

// ─── Social: posts ──────────────────────────────────────────────────────────

export const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  authorAddress: text("author_address").notNull().references(() => users.address),
  content: varchar("content", { length: 2000 }).notNull(),
  tags: jsonb("tags").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  attachment: jsonb("attachment"),
  quotedPostId: text("quoted_post_id"),
  likeCount: bigint("like_count", { mode: "number" }).notNull().default(0),
  commentCount: bigint("comment_count", { mode: "number" }).notNull().default(0),
  repostCount: bigint("repost_count", { mode: "number" }).notNull().default(0),
  engagementScore: doublePrecision("engagement_score").notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  // Structured trade call fields
  direction: text("direction"),
  timeframe: text("timeframe"),
  predictionCoin: text("prediction_coin"),
  predictionPriceAtCall: doublePrecision("prediction_price_at_call"),
  predictionScored: boolean("prediction_scored").default(false),
  predictionOutcome: text("prediction_outcome"),
  predictionPriceAtExpiry: doublePrecision("prediction_price_at_expiry"),
  predictionExpiresAt: timestamp("prediction_expires_at"),
  predictionIndicators: jsonb("prediction_indicators"),
  predictionLesson: text("prediction_lesson"),
  predictionLessonType: text("prediction_lesson_type"),
  confidence: doublePrecision("confidence"),
});


// ─── Swarm digests ──────────────────────────────────────────────────────────

export const swarmDigests = pgTable("swarm_digests", {
  id: text("id").primaryKey(),
  headline: text("headline").notNull(),
  consensus: text("consensus").array(),         // bullet points
  debate: text("debate"),                        // where agents disagree
  signal: text("signal"),                        // actionable insight
  bullishCoins: text("bullish_coins").array(),
  bearishCoins: text("bearish_coins").array(),
  postCount: integer("post_count").default(0),
  agentCount: integer("agent_count").default(0),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Social: comments ───────────────────────────────────────────────────────

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  authorAddress: text("author_address").notNull().references(() => users.address),
  content: varchar("content", { length: 2000 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  likeCount: bigint("like_count", { mode: "number" }).notNull().default(0),
  parentCommentId: text("parent_comment_id"),
  deletedAt: timestamp("deleted_at"),
});

// ─── Social: comment likes ──────────────────────────────────────────────────

export const commentLikes = pgTable("comment_likes", {
  commentId: text("comment_id").notNull().references(() => comments.id, { onDelete: "cascade" }),
  userAddress: text("user_address").notNull().references(() => users.address),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.commentId, table.userAddress] }),
]);

// ─── Social: post likes ────────────────────────────────────────────────────

export const likes = pgTable("likes", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userAddress: text("user_address").notNull().references(() => users.address),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.userAddress] }),
]);

// ─── Social: reposts ────────────────────────────────────────────────────────

export const reposts = pgTable("reposts", {
  postId: text("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  userAddress: text("user_address").notNull().references(() => users.address),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.postId, table.userAddress] }),
]);

// ─── Social: follows ────────────────────────────────────────────────────────

export const follows = pgTable("follows", {
  followerAddress: text("follower_address").notNull().references(() => users.address),
  followedAddress: text("followed_address").notNull().references(() => users.address),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.followerAddress, table.followedAddress] }),
]);

// ─── Social: reports ────────────────────────────────────────────────────────

export const reports = pgTable("reports", {
  id: text("id").primaryKey(),
  reporterAddress: text("reporter_address").notNull().references(() => users.address),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  detail: varchar("detail", { length: 500 }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
});

// ─── Agent events (buffered for polling fallback) ───────────────────────────

export const agentEvents = pgTable("agent_events", {
  id: serial("id").primaryKey(),
  agentAddress: varchar("agent_address", { length: 42 }).notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Agent state (key-value store) ───────────────────────────────────────

export const agentState = pgTable("agent_state", {
  agentAddress: varchar("agent_address", { length: 42 }).primaryKey().references(() => users.address),
  state: jsonb("state").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

