import { FastifyRequest, FastifyReply } from 'fastify';
import { extractTokenFromHeader, verifyToken } from '../utils/jwt.js';
import { AuthenticationError } from '../types/index.js';

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

    const payload = verifyToken(token);
    
    // Attach user to request
    (request as any).user = {
      userId: payload.userId,
      role: payload.role,
    };
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

    if (token) {
      const payload = verifyToken(token);
      (request as any).user = {
        userId: payload.userId,
        role: payload.role,
      };
    }
  } catch (error) {
    // Silently fail for optional auth
    (request as any).user = undefined;
  }
};
