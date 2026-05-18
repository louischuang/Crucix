import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

let pool = null;
let initPromise = null;
let warnedUnavailable = false;

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };
  }

  if (!process.env.PGHOST && !process.env.PGDATABASE) return null;

  return {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  };
}

export function isDatabaseConfigured() {
  return !!buildPoolConfig();
}

export function getPool() {
  if (pool) return pool;
  const config = buildPoolConfig();
  if (!config) return null;
  pool = new Pool({
    ...config,
    max: parseInt(process.env.PUBLIC_API_DB_POOL_SIZE || '4', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: parseInt(process.env.PUBLIC_API_DB_CONNECT_TIMEOUT_MS || '3000', 10),
  });
  pool.on('error', err => {
    console.warn('[Public API] PostgreSQL pool error:', err.message);
  });
  return pool;
}

export async function initUsageLogDb() {
  const db = getPool();
  if (!db) {
    if (!warnedUnavailable) {
      console.warn('[Public API] DATABASE_URL/PG* not configured; usage logging will run in no-op mode');
      warnedUnavailable = true;
    }
    return false;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
      await db.query(schema);
      console.log('[Public API] PostgreSQL usage log schema ready');
      return true;
    })().catch(err => {
      initPromise = null;
      console.warn('[Public API] PostgreSQL usage log init failed:', err.message);
      return false;
    });
  }

  return initPromise;
}

export async function insertUsageLog(entry) {
  const db = getPool();
  if (!db) return false;

  await initUsageLogDb();
  await db.query(
    `insert into api_usage_logs
      (request_id, method, path, status_code, duration_ms, client_ip, user_agent, api_key_hash, error)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.requestId,
      entry.method,
      entry.path,
      entry.statusCode,
      entry.durationMs,
      entry.clientIp,
      entry.userAgent,
      entry.apiKeyHash,
      entry.error,
    ]
  );
  return true;
}
