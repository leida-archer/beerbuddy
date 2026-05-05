/**
 * Drizzle DB client — Neon serverless HTTP driver.
 *
 * No connection pooling: each query opens an HTTP request. This is
 * the right choice for Vercel's per-request serverless model AND
 * for GitHub Actions ingestion runs (each adapter is a short-lived
 * script that benefits from no setup overhead).
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Neon connection string.",
  );
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export { schema };
