import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config';

export const correlationStorage = new AsyncLocalStorage<string>();

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

const addCorrelationId = winston.format((info) => {
  const correlationId = correlationStorage.getStore();
  if (correlationId) info.correlationId = correlationId;
  return info;
});

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: combine(
    errors({ stack: true }),
    addCorrelationId(),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    json()
  ),
  transports: [
    new winston.transports.Console({
      format: combine(colorize(), simple()),
      silent: config.NODE_ENV === 'test',
    }),
    new DailyRotateFile({
      filename: 'logs/app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
});
