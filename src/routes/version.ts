import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { resolve } from 'path';

interface VersionResponse {
  version: string;
}

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')
);

export async function registerResolverRoutes(server: FastifyInstance): Promise<void> {
  server.get('/resolver/v1/version', {
    schema: {
      tags: ['Version'],
      summary: 'Liveness check',
      description: 'Returns the current app version.',
      response: {
        200: {
          type: 'object',
          properties: {
            version: { type: 'string' },
          },
        },
      },
    },
  }, async (_request, reply) => {
    const version = packageJson.version?.startsWith('v')
      ? packageJson.version
      : `v${packageJson.version}`;

    const response: VersionResponse = { version };

    return reply.send(response);
  });
}
