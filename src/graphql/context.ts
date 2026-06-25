import { FastifyRequest, FastifyReply } from 'fastify';
import { optionalAuthenticate } from '../middleware/auth.middleware.js';
import { verifyToken } from '../utils/jwt.js';
import { validateViaMainApi } from '../utils/remoteAuth.js';
import { gameSessionService } from './pubsub.js';
import { AuthContext } from '../types/index.js';

export interface GraphQLContextWithServices {
  user?: AuthContext;
  /** Raw bearer token for the request, when present — captured so cca can write results back to the main API as this player. */
  token?: string;
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
  const authHeader = request.headers.authorization;
  const token =
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : undefined;
  return {
    user,
    token,
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
      // Local verification failed — fall back to the main API (handles a
      // JWT_SECRET drift between this service and the token issuer).
      user = (await validateViaMainApi(token)) ?? undefined;
    }
  }
  return {
    user,
    token: token ?? undefined,
    gameSessionService,
  };
};
