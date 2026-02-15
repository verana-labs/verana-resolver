import { resolveDID } from './did-resolver.js';
import { createLogger } from '../logger.js';

const logger = createLogger('jsonld-doc-loader');

interface DocumentLoaderResult {
  contextUrl: string | null;
  documentUrl: string;
  document: Record<string, unknown>;
}

export type DocumentLoader = (url: string) => Promise<DocumentLoaderResult>;

// ---------------------------------------------------------------------------
// Augmented W3C examples/v1 context
//
// The published https://www.w3.org/2018/credentials/examples/v1 context does
// NOT define the VC JSON Schema terms (JsonSchemaCredential, digestSRI,
// jsonSchema) that are used by credentials in the wild.  Those terms are
// defined in the VC v2 context but the credentials only reference v1 +
// examples/v1.  We augment examples/v1 with the missing term mappings so
// that JSON-LD expansion produces the same canonical form the issuer used
// when signing.
// ---------------------------------------------------------------------------
const EXAMPLES_V1_URL = 'https://www.w3.org/2018/credentials/examples/v1';

const AUGMENTED_EXAMPLES_V1: Record<string, unknown> = {
  '@context': [
    { '@version': 1.1 },
    'https://www.w3.org/ns/odrl.jsonld',
    {
      // ---- original examples/v1 terms ----
      'ex': 'https://example.org/examples#',
      'schema': 'http://schema.org/',
      'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      '3rdPartyCorrelation': 'ex:3rdPartyCorrelation',
      'AllVerifiers': 'ex:AllVerifiers',
      'Archival': 'ex:Archival',
      'BachelorDegree': 'ex:BachelorDegree',
      'Child': 'ex:Child',
      'CLCredentialDefinition2019': 'ex:CLCredentialDefinition2019',
      'CLSignature2019': 'ex:CLSignature2019',
      'IssuerPolicy': 'ex:IssuerPolicy',
      'HolderPolicy': 'ex:HolderPolicy',
      'Mother': 'ex:Mother',
      'RelationshipCredential': 'ex:RelationshipCredential',
      'UniversityDegreeCredential': 'ex:UniversityDegreeCredential',
      'AlumniCredential': 'ex:AlumniCredential',
      'DisputeCredential': 'ex:DisputeCredential',
      'PrescriptionCredential': 'ex:PrescriptionCredential',
      'ZkpExampleSchema2018': 'ex:ZkpExampleSchema2018',
      'issuerData': 'ex:issuerData',
      'attributes': 'ex:attributes',
      'signature': 'ex:signature',
      'signatureCorrectnessProof': 'ex:signatureCorrectnessProof',
      'primaryProof': 'ex:primaryProof',
      'nonRevocationProof': 'ex:nonRevocationProof',
      'alumniOf': { '@id': 'schema:alumniOf', '@type': 'rdf:HTML' },
      'child': { '@id': 'ex:child', '@type': '@id' },
      'degree': 'ex:degree',
      'degreeType': 'ex:degreeType',
      'degreeSchool': 'ex:degreeSchool',
      'college': 'ex:college',
      'name': { '@id': 'schema:name', '@type': 'rdf:HTML' },
      'givenName': 'schema:givenName',
      'familyName': 'schema:familyName',
      'parent': { '@id': 'ex:parent', '@type': '@id' },
      'referenceId': 'ex:referenceId',
      'documentPresence': 'ex:documentPresence',
      'evidenceDocument': 'ex:evidenceDocument',
      'spouse': 'schema:spouse',
      'subjectPresence': 'ex:subjectPresence',
      'verifier': { '@id': 'ex:verifier', '@type': '@id' },
      'currentStatus': 'ex:currentStatus',
      'statusReason': 'ex:statusReason',
      'prescription': 'ex:prescription',

      // ---- VC JSON Schema terms (from VC v2 context, missing in examples/v1) ----
      'JsonSchemaCredential': 'https://www.w3.org/2018/credentials#JsonSchemaCredential',
      'digestSRI': { '@id': 'https://www.w3.org/2018/credentials#digestSRI' },
      'jsonSchema': { '@id': 'https://www.w3.org/2018/credentials#jsonSchema' },
    },
  ],
};

/**
 * Create a JSON-LD document loader that:
 * 1. Returns the augmented examples/v1 context for the W3C examples URL
 * 2. Resolves DID URLs using the DIF-based did-resolver
 * 3. Falls back to network fetch for all other URLs
 */
export function createDocumentLoader(): DocumentLoader {
  // In-memory cache for fetched contexts (avoids redundant network requests)
  const contextCache = new Map<string, Record<string, unknown>>();

  async function loader(url: string): Promise<DocumentLoaderResult> {
    // 1. Augmented examples/v1 context
    if (url === EXAMPLES_V1_URL) {
      return { contextUrl: null, documentUrl: url, document: AUGMENTED_EXAMPLES_V1 };
    }

    // 2. DID resolution
    if (url.startsWith('did:')) {
      const { result, error } = await resolveDID(url);
      if (!result || error) {
        throw new Error(`Cannot resolve DID for JSON-LD document loader: ${url} \u2014 ${error?.error ?? 'unknown'}`);
      }
      return { contextUrl: null, documentUrl: url, document: result.didDocument };
    }

    // 3. Check in-memory context cache
    const cached = contextCache.get(url);
    if (cached) {
      return { contextUrl: null, documentUrl: url, document: cached };
    }

    // 4. Network fetch
    logger.debug({ url }, 'Fetching JSON-LD context from network');
    const response = await fetch(url, {
      headers: { 'Accept': 'application/ld+json, application/json' },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch JSON-LD context ${url}: HTTP ${response.status}`);
    }
    const document = (await response.json()) as Record<string, unknown>;
    contextCache.set(url, document);
    return { contextUrl: null, documentUrl: url, document };
  }

  return loader;
}
