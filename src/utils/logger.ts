import pino from 'pino';
import { config } from '../config/index.js';

// Create Pino logger instance
export const logger = pino({
  level: config.isDevelopment ? 'debug' : 'info',
  transport: config.isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create child logger with additional context
 */
export const createLogger = (context: Record<string, unknown>) => {
  return logger.child(context);
};

export default logger;
