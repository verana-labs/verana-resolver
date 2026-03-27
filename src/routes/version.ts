import type { FastifyInstance } from 'fastify';
import pkg from '../../package.json'

interface VersionResponse {
  version: string;
}

export async function registerResolverRoutes(server: FastifyInstance): Promise<void> {
  server.get('/resolver/v1/version', {
    schema: {
      tags: ['Version'],
      summary: 'Liveness check',
      description: 'Returns 200 if the process is running, along with component status.',
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
    const response: VersionResponse = {
      version: `v${pkg.version}`,
    };

    return reply.send(response);
  });
}
