import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export const bufferEvent = async ({ agentAddress, eventType, payload }) => {
  await getDb().execute(sql`
    INSERT INTO agent_events (agent_address, event_type, payload)
    VALUES (${agentAddress}, ${eventType}, ${JSON.stringify(payload)}::jsonb)
  `);
};

export const deleteOldEvents = async () => {
  const result = await getDb().execute(sql`
    DELETE FROM agent_events WHERE created_at < NOW() - INTERVAL '24 hours'
  `);
  return result.rowCount ?? 0;
};

export const pollEvents = async ({ agentAddress, since, limit }) => {
  const db = getDb();
  if (since) {
    return db.execute(sql`
      SELECT id, event_type, payload, created_at
      FROM agent_events
      WHERE agent_address = ${agentAddress}
        AND created_at > ${since}::TIMESTAMPTZ
      ORDER BY created_at ASC
      LIMIT ${limit}
    `);
  }
  return db.execute(sql`
    SELECT id, event_type, payload, created_at
    FROM agent_events
    WHERE agent_address = ${agentAddress}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
};
