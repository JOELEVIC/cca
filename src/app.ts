import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import fastifyApollo, { fastifyApolloDrainPlugin } from '@as-integrations/fastify';
import { makeHandler } from 'graphql-ws/use/@fastify/websocket';
import { config } from './config/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { executableSchema } from './graphql/executable-schema.js';
import { buildContext, buildContextForSubscription } from './graphql/context.js';

/**
 * Build and configure Fastify application.
 * Real-time gameplay only: GraphQL (queries/mutations) + subscriptions via graphql-ws on same path.
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

  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: config.isDevelopment ? false : undefined,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '15 minutes',
  });

  await app.register(websocket);

  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  app.get('/', async (_, reply) => {
    return reply.code(200).send({
      name: 'Cameroon Chess Academy API (Game Play)',
      graphql: '/graphql',
      subscriptions: 'wss://.../subscriptions (graphql-ws)',
      health: '/health',
    });
  });

  const apollo = new ApolloServer<import('./graphql/context.js').GraphQLContextWithServices>({
    schema: executableSchema,
    plugins: [
      ApolloServerPluginLandingPageDisabled(),
      fastifyApolloDrainPlugin(app),
    ],
    formatError: (formattedError) => {
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

  await app.register(fastifyApollo(apollo), {
    context: buildContext,
  });

  // GraphQL subscriptions (graphql-ws) on same path; upgrade requests hit this
  app.register(async (fastify) => {
    const wsHandler = makeHandler(
      {
        schema: executableSchema,
        context: async (ctx) =>
          buildContextForSubscription((ctx.connectionParams ?? {}) as Record<string, unknown>),
      },
      12_000,
    );
    fastify.get('/subscriptions', { websocket: true }, wsHandler);
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  return app;
};
