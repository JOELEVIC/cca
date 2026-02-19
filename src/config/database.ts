import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from './index.js';

// Parse connection string to check for pgbouncer
const isPgBouncer = config.database.url.includes('pgbouncer=true');

// Create a PostgreSQL connection pool with Supabase-optimized settings
const pool = new pg.Pool({
  connectionString: config.database.url,
  max: isPgBouncer ? 10 : 20, // Lower max for pgbouncer
  min: 0, // No minimum connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Fail fast if can't connect
  allowExitOnIdle: true,
  // Supabase SSL settings
  ssl: config.database.url.includes('supabase.co')
    ? {
        rejectUnauthorized: false,
      }
    : false,
  // Query timeout
  query_timeout: 10000, // 10 second timeout for queries
  statement_timeout: 10000, // 10 second timeout for statements
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Global Prisma instance to prevent multiple connections
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    adapter,
    log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  });

if (config.isDevelopment) {
  global.prisma = prisma;
}

// Test connection on startup (skip exit on Vercel so handler can return 503)
prisma.$connect().catch((err) => {
  console.error('Failed to connect to database:', err);
  if (!process.env.VERCEL) process.exit(1);
});

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  await pool.end();
};
