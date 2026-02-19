import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ApolloServer } from '@apollo/server';
import fastifyApollo, { fastifyApolloDrainPlugin } from '@as-integrations/fastify';
import { config } from './config/index.js';
import { prisma } from './config/database.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers/index.js';
import { buildContext } from './graphql/context.js';
import { gameWebSocketHandler } from './domains/game/websocket/game.handler.js';

/**
 * Build and configure Fastify application
 */
export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    logger: config.isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
          level: 'debug',
        }
      : {
          level: 'info',
        },
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 1048576, // 1MB
  });

  // Register CORS
  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  // Register Helmet for security headers
  await app.register(helmet, {
    contentSecurityPolicy: config.isDevelopment ? false : undefined,
  });

  // Register rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
  });

  // Register WebSocket support
  await app.register(websocket);

  // Health check endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // Initialize Apollo Server
  const apollo = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      fastifyApolloDrainPlugin(app),
    ],
    formatError: (formattedError) => {
      // Don't leak internal server errors in production
      if (config.isProduction && formattedError.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        return {
          message: 'An unexpected error occurred',
          extensions: {
            code: 'INTERNAL_SERVER_ERROR',
          },
        };
      }
      return formattedError;
    },
  });

  await apollo.start();

  // Register Apollo Server with Fastify
  await app.register(fastifyApollo(apollo), {
    context: buildContext as any,
  });

  // WebSocket routes for live games
  app.register(async (fastify) => {
    fastify.get('/ws/game/:gameId', { websocket: true }, gameWebSocketHandler(prisma));
  });

  // Error handlers
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  return app;
};
