CREATE TABLE "agent_settings" (
	"agent_address" varchar(42) PRIMARY KEY NOT NULL,
	"allowed_coins" text[] DEFAULT '{}',
	"max_leverage" integer DEFAULT 10,
	"max_position_usd" double precision DEFAULT 10000,
	"trade_enabled" boolean DEFAULT false,
	"min_confidence" double precision DEFAULT 0.5,
	"preferred_timeframes" text[] DEFAULT '{"15m","30m","1h"}',
	"auto_predict" boolean DEFAULT true,
	"enabled_indicators" text[] DEFAULT '{"rsi","macd","bollinger_bands","ema","sma","atr","obv"}'
);
--> statement-breakpoint
ALTER TABLE "conversations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hl_leaderboard" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "last_fill_times" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "points" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "trades" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_blocks" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wallets" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "conversations" CASCADE;--> statement-breakpoint
DROP TABLE "hl_leaderboard" CASCADE;--> statement-breakpoint
DROP TABLE "last_fill_times" CASCADE;--> statement-breakpoint
DROP TABLE "logs" CASCADE;--> statement-breakpoint
DROP TABLE "messages" CASCADE;--> statement-breakpoint
DROP TABLE "notifications" CASCADE;--> statement-breakpoint
DROP TABLE "points" CASCADE;--> statement-breakpoint
DROP TABLE "subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "trades" CASCADE;--> statement-breakpoint
DROP TABLE "user_blocks" CASCADE;--> statement-breakpoint
DROP TABLE "wallets" CASCADE;--> statement-breakpoint
ALTER TABLE "agents" DROP CONSTRAINT "agents_owner_address_users_address_fk";
--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_agent_address_agents_user_address_fk" FOREIGN KEY ("agent_address") REFERENCES "public"."agents"("user_address") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "owner_address";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "emoji";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "bio";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "avatar_url";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "wallet_id";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "allowed_coins";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "max_leverage";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "max_position_usd";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "performance_fee_bps";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "hl_address";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "webhook_url";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "webhook_secret";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "trade_enabled";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "min_confidence";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "preferred_timeframes";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "auto_predict";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "auto_post";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "is_agent";
