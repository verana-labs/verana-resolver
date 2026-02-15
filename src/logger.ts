import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

export function createLogger(name: string): pino.Logger {
  return pino({ name, level });
}
