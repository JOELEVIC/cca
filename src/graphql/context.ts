import { FastifyRequest, FastifyReply } from 'fastify';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
import { verifyToken } from '../utils/jwt.js';
import { gameSessionService } from './pubsub.js';
import { AuthContext } from '../types/index.js';

export interface GraphQLContextWithServices {
  user?: AuthContext;
  gameSessionService: typeof gameSessionService;
  request?: FastifyRequest;
  reply?: FastifyReply;
}

export const buildContext = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<GraphQLContextWithServices> => {
  await optionalAuthenticate(request);
  const user = (request as any).user;
  return {
    user,
    gameSessionService,
    request,
    reply,
  };
};

/**
 * Build context for GraphQL subscriptions (graphql-ws).
 * Token can be in connectionParams.token or connectionParams.Authorization.
 */
export const buildContextForSubscription = async (connectionParams: Record<string, unknown>): Promise<GraphQLContextWithServices> => {
  const raw = connectionParams?.token ?? (connectionParams?.authorization as string)?.replace?.('Bearer ', '');
  const token = typeof raw === 'string' ? raw : null;
  let user: AuthContext | undefined;
  if (token) {
    try {
      const payload = verifyToken(token);
      user = { userId: payload.userId, role: payload.role };
    } catch {
      user = undefined;
    }
  }
  return {
    user,
    gameSessionService,
  };
};
