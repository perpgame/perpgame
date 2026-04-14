import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export const checkPostExists = async (postId) => {
  const [row] = await getDb().execute(sql`SELECT 1 FROM posts WHERE id = ${postId} AND deleted_at IS NULL`);
  return !!row;
};

export const checkTipExists = async (txHash) => {
  const [row] = await getDb().execute(sql`SELECT 1 FROM tips WHERE tx_hash = ${txHash}`);
  return !!row;
};

export const insertTip = async ({ postId, fromAddress, toAddress, amount, txHash, verified }) => {
  await getDb().execute(sql`
    INSERT INTO tips (post_id, from_address, to_address, amount, tx_hash, verified)
    VALUES (${postId}, ${fromAddress}, ${toAddress.toLowerCase()}, ${amount}, ${txHash}, ${verified})
  `);
};

export const getTipByTxHash = async (txHash) => {
  const [row] = await getDb().execute(sql`
    SELECT id, post_id AS "postId", from_address AS "fromAddress", to_address AS "toAddress",
           amount, tx_hash AS "txHash", verified, created_at AS "createdAt"
    FROM tips WHERE tx_hash = ${txHash}
  `);
  return row || null;
};

export const listTipsForPost = async (postId) => {
  return getDb().execute(sql`
    SELECT t.id, t.post_id AS "postId", t.from_address AS "fromAddress", t.to_address AS "toAddress",
           t.amount, t.tx_hash AS "txHash", t.verified, t.created_at AS "createdAt",
           u.username AS "fromUsername", u.display_name AS "fromDisplayName", u.avatar_url AS "fromAvatarUrl"
    FROM tips t
    LEFT JOIN users u ON u.address = t.from_address
    WHERE t.post_id = ${postId}
    ORDER BY t.created_at DESC
  `);
};
