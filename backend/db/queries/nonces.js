import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export const insertNonce = async (nonce) => {
  await getDb().execute(sql`INSERT INTO nonces (nonce) VALUES (${nonce})`);
};

export const getNonce = async (nonce) => {
  const [row] = await getDb().execute(sql`
    SELECT nonce, created_at, consumed FROM nonces WHERE nonce = ${nonce}
  `);
  return row || null;
};

export const deleteNonce = async (nonce) => {
  await getDb().execute(sql`DELETE FROM nonces WHERE nonce = ${nonce}`);
};

export const consumeNonce = async (nonce) => {
  const [row] = await getDb().execute(sql`
    UPDATE nonces SET consumed = TRUE
    WHERE nonce = ${nonce} AND consumed = FALSE AND created_at > NOW() - INTERVAL '10 minutes'
    RETURNING nonce
  `);
  return row || null;
};

export const markNonceConsumed = async (nonce) => {
  await getDb().execute(sql`UPDATE nonces SET consumed = TRUE WHERE nonce = ${nonce}`);
};

export const deleteExpiredNonces = async () => {
  await getDb().execute(sql`DELETE FROM nonces WHERE created_at < NOW() - INTERVAL '10 minutes'`);
};
