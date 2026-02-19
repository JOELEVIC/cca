import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * Global error handler for Fastify
 */
export const errorHandler = (
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  // Log error
  logger.error({
    err: error,
    url: request.url,
    method: request.method,
    ip: request.ip,
  });

  // Handle custom AppError
  if (error instanceof AppError) {
    reply.code(error.statusCode).send({
      error: error.name,
      message: error.message,
      code: error.code,
    });
    return;
  }

  // Handle Fastify validation errors
  if (error.validation) {
    reply.code(400).send({
      error: 'Validation Error',
      message: 'Invalid request data',
      details: error.validation,
    });
    return;
  }

  // Handle specific Fastify errors
  if (error.statusCode) {
    reply.code(error.statusCode).send({
      error: error.name || 'Error',
      message: error.message,
    });
    return;
  }

  // Default error response (don't leak internal details in production)
  reply.code(500).send({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred',
  });
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (request: FastifyRequest, reply: FastifyReply) => {
  reply.code(404).send({
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
  });
};
