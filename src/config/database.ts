import { config } from './index.js';

const hasDatabase = Boolean(config.database?.url);

let disconnectDatabase = async (): Promise<void> => {};

if (hasDatabase) {
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const pg = await import('pg');
  const url = config.database!.url!;
  const pool = new (pg.default as typeof import('pg')).Pool({
    connectionString: url,
    max: url.includes('pgbouncer=true') ? 10 : 20,
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    allowExitOnIdle: true,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : false,
    query_timeout: 10000,
    statement_timeout: 10000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({
    adapter,
    log: config.isDevelopment ? ['query', 'error', 'warn'] : ['error'],
  });
  prisma.$connect().catch((err: Error) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  });
  disconnectDatabase = async () => {
    await prisma.$disconnect();
    await pool.end();
  };
}

export { disconnectDatabase };
