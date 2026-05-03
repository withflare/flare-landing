import { Pool } from "pg";

let pool: Pool | null = null;
function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

let tableReady: Promise<void> | null = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS waitlist_emails (
          id         text        PRIMARY KEY,
          email      text        NOT NULL UNIQUE,
          source     text,
          created_at timestamptz NOT NULL DEFAULT now()
        )`,
      )
      .then(() => undefined)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  return tableReady;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return Response.json(
      { error: "Please enter a valid email" },
      { status: 400 },
    );
  }
  const source =
    typeof body.source === "string" ? body.source.slice(0, 64) : null;

  try {
    await ensureTable();
    await getPool().query(
      `INSERT INTO waitlist_emails (id, email, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [crypto.randomUUID(), email, source],
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[waitlist]", err);
    return Response.json(
      { error: "Could not save email. Please try again." },
      { status: 500 },
    );
  }
}
