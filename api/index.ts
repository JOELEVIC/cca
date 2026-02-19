/**
 * Vercel serverless entry: forwards all requests to the Fastify app.
 * All routes (/, /health, /graphql, etc.) are rewritten to this function.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';
import path from 'path';
import { pathToFileURL } from 'url';
import { z } from 'zod';

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    // Resolve dist from project root so it works on Vercel (cwd is project root)
    const appPath = path.join(process.cwd(), 'dist', 'app.js');
    const { buildApp } = await import(pathToFileURL(appPath).href);
    appPromise = buildApp();
  }
  return appPromise as Promise<FastifyInstance>;
}

function sendError(res: ServerResponse, statusCode: number, body: string) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: body }));
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const app = await getApp();
    await app.ready();

    return new Promise((resolve, reject) => {
      res.on('finish', () => resolve());
      res.on('close', () => resolve());
      res.on('error', reject);
      app.server.emit('request', req, res);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('Serverless function error:', message, stack);

    // Config validation (missing env) → 503 so logs show the real error
    if (err instanceof z.ZodError) {
      const details = err.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join('; ');
      console.error('Env validation failed:', details);
      sendError(res, 503, 'Server configuration error. Check Vercel env vars: DATABASE_URL, JWT_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY.');
      return;
    }

    sendError(res, 500, process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message);
  }
}
