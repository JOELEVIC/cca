/**
 * Vercel serverless entry: forwards all requests to the Fastify app.
 * All routes (/, /health, /graphql, etc.) are rewritten to this function.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { FastifyInstance } from 'fastify';

let appPromise: Promise<FastifyInstance> | null = null;

async function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    const { buildApp } = await import('../dist/app.js');
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
    sendError(res, 500, process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message);
  }
}
