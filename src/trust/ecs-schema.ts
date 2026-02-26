import { createHash } from 'node:crypto';
import type { CredentialSchema } from '../indexer/types.js';
import type { EcsType } from './types.js';
import { getConfig } from '../config/index.js';
import { createLogger } from '../logger.js';

const logger = createLogger('ecs-schema');

let _canonicalize: ((obj: unknown) => string) | null = null;

async function getCanonicalizer(): Promise<(obj: unknown) => string> {
  if (_canonicalize === null) {
    const mod = await import('canonicalize');
    _canonicalize = mod.default as unknown as (obj: unknown) => string;
  }
  return _canonicalize;
}

/**
 * Compute the ECS digest of a JSON schema per spec [ECS-TR]:
 * 1. Parse json_schema string as JSON
 * 2. Remove the $id property
 * 3. Canonicalize using JCS (RFC 8785)
 * 4. Compute SHA-384 digest
 * 5. Return in SRI format: sha384-<base64>
 */
export async function computeEcsDigest(jsonSchemaStr: string): Promise<string> {
  const parsed = JSON.parse(jsonSchemaStr) as Record<string, unknown>;
  delete parsed.$id;
  const canonicalize = await getCanonicalizer();
  const canonical = canonicalize(parsed);
  if (!canonical) throw new Error('Failed to JCS-canonicalize schema for ECS digest');
  const hash = createHash('sha384').update(canonical, 'utf8').digest('base64');
  return `sha384-${hash}`;
}

/**
 * Classify a CredentialSchema as an ECS type by comparing its JCS digest
 * against the reference digests from the spec [ECS-TR].
 */
export async function classifyEcsTypeByDigest(jsonSchemaStr: string): Promise<EcsType> {
  try {
    const digest = await computeEcsDigest(jsonSchemaStr);
    const config = getConfig();

    if (digest === config.ECS_DIGEST_SERVICE) return 'ECS-SERVICE';
    if (digest === config.ECS_DIGEST_ORG) return 'ECS-ORG';
    if (digest === config.ECS_DIGEST_PERSONA) return 'ECS-PERSONA';
    if (digest === config.ECS_DIGEST_UA) return 'ECS-UA';

    logger.debug({ digest }, 'Schema digest does not match any known ECS type');
    return null;
  } catch (err) {
    logger.warn({ error: err instanceof Error ? err.message : String(err) }, 'Failed to compute ECS digest');
    return null;
  }
}

const ALL_ECS_TYPES: NonNullable<EcsType>[] = ['ECS-SERVICE', 'ECS-ORG', 'ECS-PERSONA', 'ECS-UA'];

/**
 * Verify that a set of credential schemas provides all 4 ECS schema types.
 * Per spec [ECS-TR], an ECS trust registry MUST provide Service, Organization,
 * Persona, and UserAgent credential schemas.
 */
export async function verifyEcsTrCompleteness(
  schemas: CredentialSchema[],
): Promise<{ complete: boolean; foundTypes: Set<NonNullable<EcsType>>; missingTypes: NonNullable<EcsType>[] }> {
  const foundTypes = new Set<NonNullable<EcsType>>();

  for (const schema of schemas) {
    try {
      const ecsType = await classifyEcsTypeByDigest(schema.json_schema);
      if (ecsType) foundTypes.add(ecsType);
    } catch {
      // skip unparseable schemas
    }
  }

  const missingTypes = ALL_ECS_TYPES.filter((t) => !foundTypes.has(t));
  return { complete: missingTypes.length === 0, foundTypes, missingTypes };
}
