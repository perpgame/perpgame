import { sql, eq, or } from "drizzle-orm";
import { getDb } from "../index.js";
import { revokedTokens } from "../schema.js";

export const isTokenRevoked = async (jti, userAddress) => {
  const rows = await getDb()
    .select({ jti: revokedTokens.jti })
    .from(revokedTokens)
    .where(
      or(
        eq(revokedTokens.jti, jti),
        eq(revokedTokens.jti, `user-revoke:${userAddress}`),
      ),
    )
    .limit(1);
  return rows.length > 0;
};

export const deleteExpiredTokens = async () => {
  await getDb().execute(sql`DELETE FROM revoked_tokens WHERE revoked_at < NOW() - INTERVAL '7 days'`);
};

export const revokeToken = async (jti, userAddress) => {
  await getDb()
    .insert(revokedTokens)
    .values({ jti, userAddress })
    .onConflictDoNothing();
};

export const revokeAllUserTokens = async (address) => {
  const result = await getDb().execute(sql`
    INSERT INTO revoked_tokens (jti, user_address)
    VALUES (${`user-revoke:${address}`}, ${address}) ON CONFLICT DO NOTHING
  `);
  return (result.rowCount ?? 0) > 0;
};
