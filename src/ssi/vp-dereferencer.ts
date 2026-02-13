import { getCachedFile, setCachedFile } from '../cache/file-cache.js';
import type { LinkedVPEndpoint, DereferencedVP, DereferenceError } from './types.js';
import { extractCredentialsFromVP } from './vc-verifier.js';

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
      return { result: parsed };
    } catch {
      // Invalid cache — re-fetch
    }
  }

  // Fetch VP from endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(vpUrl, {
      headers: { Accept: 'application/json, application/ld+json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        error: {
          resource: vpUrl,
          resourceType: 'vp',
          error: `HTTP ${response.status}: ${response.statusText}`,
          timestamp: Date.now(),
        },
      };
    }

    const vpJson = (await response.json()) as Record<string, unknown>;
    const credentials = extractCredentialsFromVP(vpJson);

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
    return {
      error: {
        resource: vpUrl,
        resourceType: 'vp',
        error: err instanceof Error ? err.message : String(err),
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
  const vps: DereferencedVP[] = [];
  const errors: DereferenceError[] = [];

  // Fetch all VPs in parallel
  const results = await Promise.all(endpoints.map((ep) => dereferenceVP(ep.serviceEndpoint)));

  for (const res of results) {
    if (res.result) vps.push(res.result);
    if (res.error) errors.push(res.error);
  }

  return { vps, errors };
}
