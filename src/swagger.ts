import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(server: FastifyInstance): Promise<void> {
  await server.register(swagger, {
    openapi: {
      info: {
        title: 'Verana Trust Resolver',
        description: 'Trust resolution and authorization API for the Verana Network',
        version: '0.1.0',
      },
      tags: [
        { name: 'Trust', description: 'Trust resolution and authorization queries' },
        { name: 'Health', description: 'Health and readiness checks' },
        { name: 'Dev', description: 'Development-mode endpoints' },
        { name: 'Metrics', description: 'Observability' },
      ],
    },
  });

  await server.register(swaggerUi, {
    routePrefix: '/docs',
  });
}
