import { getCachedFile, setCachedFile } from '../cache/file-cache.js';
import type { LinkedVPEndpoint, DereferencedVP, DereferenceError } from './types.js';
import { extractCredentialsFromVP } from './vc-verifier.js';
import pino from 'pino';

const logger = pino({ name: 'vp-dereferencer' });
const LINKED_VP_TYPE = 'LinkedVerifiablePresentation';
const FETCH_TIMEOUT_MS = 10_000;

export function extractLinkedVPEndpoints(didDocument: Record<string, unknown>): LinkedVPEndpoint[] {
  const service = didDocument.service;
  if (!Array.isArray(service)) return [];

  return service
    .filter((svc): svc is Record<string, unknown> => {
      if (typeof svc !== 'object' || svc === null) return false;
      const svcType = (svc as Record<string, unknown>).type;
      if (typeof svcType === 'string') return svcType === LINKED_VP_TYPE;
      if (Array.isArray(svcType)) return svcType.includes(LINKED_VP_TYPE);
      return false;
    })
    .map((svc) => ({
      id: String(svc.id ?? ''),
      type: LINKED_VP_TYPE,
      serviceEndpoint: String(svc.serviceEndpoint ?? ''),
    }))
    .filter((ep) => ep.serviceEndpoint.startsWith('http'));
}

export async function dereferenceVP(vpUrl: string): Promise<{
  result?: DereferencedVP;
  error?: DereferenceError;
}> {
  // Check Redis cache
  const cached = await getCachedFile(vpUrl);
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached) as DereferencedVP;
      logger.debug({ vpUrl, credentials: parsed.credentials.length }, 'VP cache hit');
      return { result: parsed };
    } catch {
      logger.debug({ vpUrl }, 'VP cache entry invalid \u2014 re-fetching');
      // Invalid cache \u2014 re-fetch
    }
  } else {
    logger.debug({ vpUrl }, 'VP cache miss');
  }

  // Fetch VP from endpoint
  logger.debug({ vpUrl }, 'Fetching VP from endpoint');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(vpUrl, {
      headers: { Accept: 'application/json, application/ld+json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const error = `HTTP ${response.status}: ${response.statusText}`;
      logger.debug({ vpUrl, status: response.status, error }, 'VP fetch failed');
      return {
        error: {
          resource: vpUrl,
          resourceType: 'vp',
          error,
          timestamp: Date.now(),
        },
      };
    }

    const vpJson = (await response.json()) as Record<string, unknown>;
    const credentials = extractCredentialsFromVP(vpJson);

    logger.debug({ vpUrl, credentials: credentials.length }, 'VP fetched successfully');

    const dereferenced: DereferencedVP = {
      vpUrl,
      vp: vpJson,
      credentials,
      cachedAt: Date.now(),
    };

    // Cache in Redis
    await setCachedFile(vpUrl, JSON.stringify(dereferenced));

    return { result: dereferenced };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.debug({ vpUrl, error: errorMsg }, 'VP fetch threw an exception');
    return {
      error: {
        resource: vpUrl,
        resourceType: 'vp',
        error: errorMsg,
        timestamp: Date.now(),
      },
    };
  }
}

export async function dereferenceAllVPs(
  didDocument: Record<string, unknown>,
): Promise<{
  vps: DereferencedVP[];
  errors: DereferenceError[];
}> {
  const endpoints = extractLinkedVPEndpoints(didDocument);
  logger.debug({ endpointCount: endpoints.length, endpoints: endpoints.map((e) => e.serviceEndpoint) }, 'Extracted LinkedVP endpoints from DID document');

  const vps: DereferencedVP[] = [];
  const errors: DereferenceError[] = [];

  // Fetch all VPs in parallel
  const results = await Promise.all(endpoints.map((ep) => dereferenceVP(ep.serviceEndpoint)));

  for (const res of results) {
    if (res.result) vps.push(res.result);
    if (res.error) errors.push(res.error);
  }

  const totalCreds = vps.reduce((sum, vp) => sum + vp.credentials.length, 0);
  logger.debug({ vpsOk: vps.length, vpsFailed: errors.length, totalCredentials: totalCreds }, 'VP dereference complete');

  return { vps, errors };
}
