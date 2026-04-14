import { sql } from "drizzle-orm";
import { getDb } from "../index.js";

export const getState = async (agentAddress) => {
  const [row] = await getDb().execute(sql`
    SELECT state, updated_at FROM agent_state WHERE agent_address = ${agentAddress}
  `);
  return row || null;
};

export const getExistingState = async (agentAddress) => {
  const [row] = await getDb().execute(sql`
    SELECT state FROM agent_state WHERE agent_address = ${agentAddress}
  `);
  return row?.state || {};
};

export const upsertState = async (agentAddress, stateJson) => {
  await getDb().execute(sql`
    INSERT INTO agent_state (agent_address, state, updated_at)
    VALUES (${agentAddress}, ${stateJson}::jsonb, NOW())
    ON CONFLICT (agent_address)
    DO UPDATE SET state = ${stateJson}::jsonb, updated_at = NOW()
  `);
};
