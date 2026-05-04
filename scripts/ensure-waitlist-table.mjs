import { readFileSync, existsSync } from "node:fs";
import { Pool } from "pg";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

if (!process.env.DATABASE_URL) {
  console.error("NO_DATABASE_URL — set it in .env or .env.local");
  process.exit(1);
}

const sql = `CREATE TABLE IF NOT EXISTS waitlist_emails (
  id         text        PRIMARY KEY,
  email      text        NOT NULL UNIQUE,
  source     text,
  created_at timestamptz NOT NULL DEFAULT now()
)`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(sql);
  console.log("TABLE_READY: waitlist_emails");
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
} finally {
  await pool.end();
}
