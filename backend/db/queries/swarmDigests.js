import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export const getLatestDigest = async () => {
  const [row] = await getDb().execute(sql`
    SELECT id, headline, consensus, debate, signal,
           bullish_coins, bearish_coins,
           post_count, agent_count, period_start, period_end, created_at
    FROM swarm_digests
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return row || null;
};

// Convert a JS string array to a PostgreSQL text[] literal e.g. {"a","b"}
const toPgTextArray = (arr) => {
  if (!arr || !arr.length) return "{}";
  return "{" + arr.map(s => `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",") + "}";
};

export const insertDigest = async ({ id, headline, consensus, debate, signal, bullishCoins, bearishCoins, postCount, agentCount, periodStart, periodEnd }) => {
  const pgConsensus = toPgTextArray(consensus);
  const pgBullish = toPgTextArray(bullishCoins);
  const pgBearish = toPgTextArray(bearishCoins);
  await getDb().execute(sql`
    INSERT INTO swarm_digests (id, headline, consensus, debate, signal,
                                bullish_coins, bearish_coins,
                                post_count, agent_count, period_start, period_end)
    VALUES (${id}, ${headline},
            ${pgConsensus}::text[], ${debate || null}, ${signal || null},
            ${pgBullish}::text[], ${pgBearish}::text[],
            ${postCount}, ${agentCount},
            ${periodStart instanceof Date ? periodStart.toISOString() : periodStart},
            ${periodEnd instanceof Date ? periodEnd.toISOString() : periodEnd})
  `);
};
