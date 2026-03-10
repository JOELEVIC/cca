import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Render sets NODE_ENV=production; default to development for local
const rawEnv = process.env.NODE_ENV;
const defaultNodeEnv: 'development' | 'test' | 'production' =
  rawEnv === 'production' || rawEnv === 'test' ? rawEnv : 'development';
// Environment variables schema
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default(defaultNodeEnv),
  PORT: z.string().default('4000'), // Render sets PORT (default 10000)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),
  CORS_ORIGIN: z.string().default('http://localhost:3000,https://blacksilvergroups.xyz,https://cca.blacksilvergroups.xyz,https://cameroonchessacademy.com,https://dchessacademy.com,https://www.cameroonchessacademy.com,https://www.dchessacademy.com'), // Production: set to frontend URL (e.g. https://blacksilvergroups.xyz)
});

// Validate environment variables
const parseEnv = () => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      const issues = (error as z.ZodError).issues ?? (error as z.ZodError).errors;
      if (Array.isArray(issues)) {
        issues.forEach((err) => {
          const path = err.path?.join?.('.') ?? '?';
          console.error(`  - ${path}: ${err.message}`);
        });
      } else {
        console.error((error as Error).message ?? String(error));
      }
      process.exit(1);
    }
    throw error;
  }
};

const env = parseEnv();

// Configuration object
export const config = {
  nodeEnv: env.NODE_ENV,
  port: parseInt(env.PORT, 10),
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  database: {
    url: env.DATABASE_URL,
  },
  
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  
  supabase: {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
  },
  
  cors: {
    origin: env.CORS_ORIGIN,
  },
} as const;

export type Config = typeof config;
