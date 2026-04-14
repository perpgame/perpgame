import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

let db = null;
let rawClient = null;

export const connectDb = async () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  rawClient = postgres(url);
  db = drizzle(rawClient, { schema });

  await rawClient`SELECT 1`;
  console.log("Postgres connected");

  return db;
};

export const getDb = () => {
  if (!db) throw new Error("Database not initialized. Call connectDb() first.");
  return db;
};

export const getRawClient = () => {
  if (!rawClient) throw new Error("Database not initialized. Call connectDb() first.");
  return rawClient;
};
