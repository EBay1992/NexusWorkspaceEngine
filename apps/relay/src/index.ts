import { logger } from './logger.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const server = await buildServer();
  await server.listen();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down relay');
    try {
      await server.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal relay startup error');
  process.exit(1);
});
