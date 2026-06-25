import { FastifyRequest, FastifyReply } from 'fastify';
import { extractTokenFromHeader, verifyToken } from '../utils/jwt.js';
import { validateViaMainApi } from '../utils/remoteAuth.js';
import { AuthenticationError } from '../types/index.js';

/**
 * Resolve a bearer token to a user. Fast path: local JWT verification. If that
 * fails (e.g. a JWT_SECRET drift between this service and the token issuer),
 * fall back to validating the token against the main API. Returns null if
 * neither path recognises the token.
 */
async function resolveUser(token: string): Promise<{ userId: string; role: string } | null> {
  try {
    const payload = verifyToken(token);
    return { userId: payload.userId, role: payload.role };
  } catch {
    return validateViaMainApi(token);
  }
}

/**
 * Authentication middleware for Fastify
 * Extracts and verifies JWT token, attaches user to request
 */
export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      throw new AuthenticationError('No token provided');
    }

    const user = await resolveUser(token);
    if (!user) {
      throw new AuthenticationError('Invalid token');
    }
    (request as any).user = user;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      reply.code(401).send({
        error: 'Authentication Error',
        message: error.message,
      });
      return;
    }
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuthenticate = async (request: FastifyRequest) => {
  try {
    const authHeader = request.headers.authorization;
    const token = extractTokenFromHeader(authHeader);
    (request as any).user = token ? (await resolveUser(token)) ?? undefined : undefined;
  } catch {
    // Silently fail for optional auth
    (request as any).user = undefined;
  }
};
