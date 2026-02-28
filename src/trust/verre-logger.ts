import type { IVerreLogger } from '@verana-labs/verre';
import { createLogger } from '../logger.js';

const pinoLogger = createLogger('verre');

/**
 * Adapter that bridges verre's IVerreLogger interface to our pino logger.
 */
export const verreLogger: IVerreLogger = {
  debug(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      pinoLogger.debug(meta, message);
    } else {
      pinoLogger.debug(message);
    }
  },
  info(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      pinoLogger.info(meta, message);
    } else {
      pinoLogger.info(message);
    }
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    if (meta) {
      pinoLogger.warn(meta, message);
    } else {
      pinoLogger.warn(message);
    }
  },
  error(message: string, error?: Error | unknown): void {
    if (error) {
      pinoLogger.error({ err: error }, message);
    } else {
      pinoLogger.error(message);
    }
  },
};
