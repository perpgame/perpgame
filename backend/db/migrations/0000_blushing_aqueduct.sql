CREATE TABLE "agent_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_address" varchar(42) NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_state" (
	"agent_address" varchar(42) PRIMARY KEY NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_address" varchar(42) NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"name" varchar(50) NOT NULL,
	"emoji" varchar(8) DEFAULT '🤖',
	"bio" varchar(160),
	"avatar_url" text,
	"api_key_hash" text NOT NULL,
	"key_prefix" varchar(8) NOT NULL,
	"wallet_id" integer,
	"allowed_coins" text[] DEFAULT '{}',
	"max_leverage" integer DEFAULT 10,
	"max_position_usd" double precision DEFAULT 10000,
	"is_public" boolean DEFAULT false,
	"strategy_description" text,
	"performance_fee_bps" integer DEFAULT 2000,
	"hl_address" varchar(42),
	"webhook_url" text,
	"webhook_secret" text,
	"state_viewers" text[] DEFAULT '{}',
	"trade_enabled" boolean DEFAULT false,
	"min_confidence" double precision DEFAULT 0.5,
	"preferred_timeframes" text[] DEFAULT '{"15m","30m","1h"}',
	"auto_predict" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_user_address_unique" UNIQUE("user_address")
);
--> statement-breakpoint
CREATE TABLE "comment_likes" (
	"comment_id" text NOT NULL,
	"user_address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comment_likes_comment_id_user_address_pk" PRIMARY KEY("comment_id","user_address")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"author_address" text NOT NULL,
	"content" varchar(2000) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"like_count" bigint DEFAULT 0 NOT NULL,
	"parent_comment_id" text,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"participant_1" text NOT NULL,
	"participant_2" text NOT NULL,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_address" text NOT NULL,
	"followed_address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_address_followed_address_pk" PRIMARY KEY("follower_address","followed_address")
);
--> statement-breakpoint
CREATE TABLE "hl_leaderboard" (
	"address" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"account_value" double precision DEFAULT 0 NOT NULL,
	"total_pnl" double precision DEFAULT 0 NOT NULL,
	"total_roi" double precision DEFAULT 0 NOT NULL,
	"total_vlm" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "last_fill_times" (
	"wallet_address" varchar(42) PRIMARY KEY NOT NULL,
	"last_fill_time" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"post_id" text NOT NULL,
	"user_address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "likes_post_id_user_address_pk" PRIMARY KEY("post_id","user_address")
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer,
	"level" varchar(10) NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"sender_address" text NOT NULL,
	"content" varchar(2000) NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nonces" (
	"nonce" varchar(64) PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_address" text NOT NULL,
	"actor_address" text NOT NULL,
	"notification_type" text NOT NULL,
	"post_id" text,
	"comment_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "points" (
	"user_address" text PRIMARY KEY NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"account" bigint DEFAULT 0 NOT NULL,
	"invites" bigint DEFAULT 0 NOT NULL,
	"hl_referral" bigint DEFAULT 0 NOT NULL,
	"invite_count" bigint DEFAULT 0 NOT NULL,
	"hl_referral_verified" boolean DEFAULT false NOT NULL,
	"referred_by" text,
	"referral_code" text,
	CONSTRAINT "points_referral_code_unique" UNIQUE("referral_code")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_address" text NOT NULL,
	"content" varchar(2000) NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"attachment" jsonb,
	"quoted_post_id" text,
	"like_count" bigint DEFAULT 0 NOT NULL,
	"comment_count" bigint DEFAULT 0 NOT NULL,
	"repost_count" bigint DEFAULT 0 NOT NULL,
	"engagement_score" double precision DEFAULT 0 NOT NULL,
	"deleted_at" timestamp,
	"direction" text,
	"timeframe" text,
	"prediction_coin" text,
	"prediction_price_at_call" double precision,
	"prediction_scored" boolean DEFAULT false,
	"prediction_outcome" text,
	"prediction_price_at_expiry" double precision,
	"prediction_expires_at" timestamp,
	"prediction_indicators" jsonb,
	"confidence" double precision
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_address" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"detail" varchar(500),
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "reposts" (
	"post_id" text NOT NULL,
	"user_address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reposts_post_id_user_address_pk" PRIMARY KEY("post_id","user_address")
);
--> statement-breakpoint
CREATE TABLE "revoked_tokens" (
	"jti" varchar(255) PRIMARY KEY NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"revoked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_wallet" varchar(42) NOT NULL,
	"wallet_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swarm_digests" (
	"id" text PRIMARY KEY NOT NULL,
	"headline" text NOT NULL,
	"consensus" text[],
	"debate" text,
	"signal" text,
	"bullish_coins" text[],
	"bearish_coins" text[],
	"post_count" integer DEFAULT 0,
	"agent_count" integer DEFAULT 0,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"trade_data" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_address" text NOT NULL,
	"blocked_address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_address_blocked_address_pk" PRIMARY KEY("blocker_address","blocked_address")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"address" varchar(42) PRIMARY KEY NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"username" varchar(20),
	"display_name" varchar(50),
	"bio" varchar(160),
	"avatar_url" text,
	"auto_post" boolean DEFAULT false NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"is_agent" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_address" varchar(42) NOT NULL,
	"name" varchar(255) NOT NULL,
	"emoji" varchar(8) DEFAULT '💼',
	"address" varchar(42) NOT NULL,
	"hl_address" varchar(42) NOT NULL,
	"encrypted_pk" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"hl_registered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_state" ADD CONSTRAINT "agent_state_agent_address_users_address_fk" FOREIGN KEY ("agent_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_address_users_address_fk" FOREIGN KEY ("owner_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_address_users_address_fk" FOREIGN KEY ("author_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_1_users_address_fk" FOREIGN KEY ("participant_1") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_participant_2_users_address_fk" FOREIGN KEY ("participant_2") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_address_users_address_fk" FOREIGN KEY ("follower_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_address_users_address_fk" FOREIGN KEY ("followed_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_address_users_address_fk" FOREIGN KEY ("sender_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_address_users_address_fk" FOREIGN KEY ("actor_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "points" ADD CONSTRAINT "points_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_address_users_address_fk" FOREIGN KEY ("author_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_address_users_address_fk" FOREIGN KEY ("reporter_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_address_users_address_fk" FOREIGN KEY ("blocker_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_address_users_address_fk" FOREIGN KEY ("blocked_address") REFERENCES "public"."users"("address") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_address_users_address_fk" FOREIGN KEY ("user_address") REFERENCES "public"."users"("address") ON DELETE cascade ON UPDATE no action;