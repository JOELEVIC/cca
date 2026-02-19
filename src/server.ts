import { buildApp } from './app.js';
import { config } from './config/index.js';
import { disconnectDatabase } from './config/database.js';
import logger from './utils/logger.js';

/**
 * Start the server
 */
const start = async () => {
  try {
    const app = await buildApp();

    // Start listening
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });

    logger.info(`
🚀 Server is running!
📍 Port: ${config.port}
🌍 Environment: ${config.nodeEnv}
🔗 Health check: http://localhost:${config.port}/health
    `);

    // Graceful shutdown handlers
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      try {
        await app.close();
        await disconnectDatabase();
        logger.info('Server closed successfully');
        process.exit(0);
      } catch (error: any) {
        logger.error({ err: error, msg: 'Error during shutdown' });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error: any) {
    logger.error({ err: error, msg: 'Failed to start server' });
    process.exit(1);
  }
};

// Start the server
start();
