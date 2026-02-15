import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getSummaryTrustResult, getFullTrustResult } from '../trust/trust-store.js';

interface Q1QueryString {
  did?: string;
  detail?: string;
}

export async function registerQ1Route(server: FastifyInstance): Promise<void> {
  server.get<{ Querystring: Q1QueryString }>(
    '/v1/trust/resolve',
    {
      schema: {
        tags: ['Trust'],
        summary: 'Resolve trust status for a DID',
        description: 'Returns the cached trust evaluation result for a DID. Use detail=full for the complete evaluation tree.',
        querystring: {
          type: 'object',
          properties: {
            did: { type: 'string', description: 'DID to resolve (e.g. did:web:example.com)' },
            detail: { type: 'string', default: 'summary', description: 'Level of detail: "summary" or "full"' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true, description: 'Trust evaluation result' },
          400: {
            type: 'object',
            properties: { error: { type: 'string' }, message: { type: 'string' } },
          },
          404: {
            type: 'object',
            properties: { error: { type: 'string' }, message: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: Q1QueryString }>, reply: FastifyReply) => {
      const { did, detail } = request.query;

      // Validate required parameter
      if (!did || typeof did !== 'string' || !did.startsWith('did:')) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Missing or invalid "did" query parameter. Must be a valid DID.',
        });
      }

      // Validate detail parameter
      const detailMode = detail ?? 'summary';
      if (detailMode !== 'summary' && detailMode !== 'full') {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid "detail" query parameter. Must be "summary" or "full".',
        });
      }

      if (detailMode === 'summary') {
        const summary = await getSummaryTrustResult(did);
        if (!summary) {
          return reply.status(404).send({
            error: 'Not Found',
            message: `No trust evaluation found for DID: ${did}`,
          });
        }

        reply.header('X-Evaluated-At-Block', String(summary.evaluatedAtBlock));
        reply.header('X-Cache-Hit', 'true');
        return reply.send(summary);
      }

      // detail=full
      const full = await getFullTrustResult(did);
      if (!full) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `No trust evaluation found for DID: ${did}`,
        });
      }

      reply.header('X-Evaluated-At-Block', String(full.evaluatedAtBlock));
      reply.header('X-Cache-Hit', 'true');
      return reply.send(full);
    },
  );
}
