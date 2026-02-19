/**
 * Vercel serverless entry: forwards all requests to the Fastify app.
 * All routes (/, /health, /graphql, etc.) are rewritten to this function.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { buildApp } from '../dist/app.js';
import type { FastifyInstance } from 'fastify';

let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = buildApp();
  }
  return appPromise;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const app = await getApp();
  await app.ready();

  return new Promise((resolve, reject) => {
    res.on('finish', () => resolve());
    res.on('close', () => resolve());
    res.on('error', reject);
    app.server.emit('request', req, res);
  });
}
