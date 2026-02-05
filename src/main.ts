import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as dotenv from 'dotenv';
import * as winston from 'winston';

import { AppModule } from './app.module';
import { config } from './config';

dotenv.config();

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'verana-resolver' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

console.log = (...args) => logger.info(args.join(' '));
console.error = (...args) => logger.error(args.join(' '));
console.warn = (...args) => logger.warn(args.join(' '));
console.info = (...args) => logger.info(args.join(' '));
console.debug = (...args) => logger.debug(args.join(' '));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Verana Trust Resolver API')
    .setDescription('Verana Trust Resolver Container - Implements verifiable trust resolution with REST API')
    .setVersion('1.0')
    .addTag('Health')
    .addTag('Services')
    .addTag('Ecosystems')
    .addTag('Credentials')
    .addTag('DID')
    .addTag('Search')
    .addTag('Trust')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Verana Trust Resolver API Documentation',
  });

  const gracefulShutdown = async () => {
    console.log('Received shutdown signal, shutting down gracefully...');
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);

  const port = config.api.port;
  await app.listen(port);

  console.log('Verana Resolver ready!');
  console.log(`API: http://localhost:${port}/api`);
  console.log(`API Docs: http://localhost:${port}/api-docs`);
  console.log(`Health: http://localhost:${port}/health`);
  console.log(`Cache TTL: ${config.cacheTtl} seconds`);
  console.log(`Trust TTL: ${config.trustTtl} seconds`);
  console.log(`Connected VPRs: ${config.verifiablePublicRegistries.map(v => v.name).join(', ')}`);
}

bootstrap().catch((error) => {
  console.error('Failed to start Verana Resolver:', error);
  process.exit(1);
});

