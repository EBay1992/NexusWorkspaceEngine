import { pino } from 'pino';
import { loadConfig } from './config.js';

const { logLevel } = loadConfig();

export const logger = pino({
  level: logLevel,
  base: { service: 'orbit-relay' },
});

export type Logger = typeof logger;
