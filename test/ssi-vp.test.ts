import { describe, it, expect } from 'vitest';
import { extractLinkedVPEndpoints } from '../src/ssi/vp-dereferencer.js';
import {
  extractCredentialsFromVP,
  detectFormat,
  extractIssuerDid,
  extractCredentialSchemaId,
} from '../src/ssi/vc-verifier.js';

describe('extractLinkedVPEndpoints', () => {
  it('extracts LinkedVerifiablePresentation endpoints', () => {
    const didDoc = {
      service: [
        {
          id: '#linked-vp-1',
          type: 'LinkedVerifiablePresentation',
          serviceEndpoint: 'https://example.com/vp/1',
        },
        {
          id: '#other-service',
          type: 'SomeOtherService',
          serviceEndpoint: 'https://example.com/other',
        },
      ],
    };

    const endpoints = extractLinkedVPEndpoints(didDoc);
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].serviceEndpoint).toBe('https://example.com/vp/1');
    expect(endpoints[0].type).toBe('LinkedVerifiablePresentation');
  });

  it('handles array type field', () => {
    const didDoc = {
      service: [
        {
          id: '#vp-1',
          type: ['LinkedVerifiablePresentation', 'SomeOther'],
          serviceEndpoint: 'https://example.com/vp/1',
        },
      ],
    };

    const endpoints = extractLinkedVPEndpoints(didDoc);
    expect(endpoints).toHaveLength(1);
  });

  it('returns empty for no service', () => {
    expect(extractLinkedVPEndpoints({})).toEqual([]);
    expect(extractLinkedVPEndpoints({ service: 'not-array' })).toEqual([]);
  });

  it('filters non-http endpoints', () => {
    const didDoc = {
      service: [
        {
          id: '#vp-1',
          type: 'LinkedVerifiablePresentation',
          serviceEndpoint: 'ftp://example.com/vp',
        },
      ],
    };
    expect(extractLinkedVPEndpoints(didDoc)).toEqual([]);
  });

  it('extracts multiple VP endpoints', () => {
    const didDoc = {
      service: [
        {
          id: '#vp-1',
          type: 'LinkedVerifiablePresentation',
          serviceEndpoint: 'https://example.com/vp/1',
        },
        {
          id: '#vp-2',
          type: 'LinkedVerifiablePresentation',
          serviceEndpoint: 'https://example.com/vp/2',
        },
      ],
    };

    const endpoints = extractLinkedVPEndpoints(didDoc);
    expect(endpoints).toHaveLength(2);
  });
});

describe('extractCredentialsFromVP', () => {
  it('extracts VCs from VP', () => {
    const vp = {
      verifiableCredential: [
        {
          id: 'vc-1',
          issuer: 'did:web:issuer.com',
          credentialSchema: { id: 'https://example.com/schema/1' },
        },
        {
          id: 'vc-2',
          issuer: { id: 'did:web:issuer2.com' },
        },
      ],
    };

    const creds = extractCredentialsFromVP(vp);
    expect(creds).toHaveLength(2);
    expect(creds[0].issuerDid).toBe('did:web:issuer.com');
    expect(creds[0].credentialSchemaId).toBe('https://example.com/schema/1');
    expect(creds[1].issuerDid).toBe('did:web:issuer2.com');
  });

  it('handles missing verifiableCredential', () => {
    expect(extractCredentialsFromVP({})).toEqual([]);
  });

  it('assigns sequential IDs when VC has no id', () => {
    const vp = {
      verifiableCredential: [
        { issuer: 'did:web:a.com' },
        { issuer: 'did:web:b.com' },
      ],
    };

    const creds = extractCredentialsFromVP(vp);
    expect(creds[0].vcId).toBe('vc-0');
    expect(creds[1].vcId).toBe('vc-1');
  });
});

describe('detectFormat', () => {
  it('detects JWT format from string', () => {
    expect(detectFormat('eyJhbGciOiJFUzI1NiJ9.eyJpc3MiOiJkaWQ6d2ViOnguY29tIn0.sig')).toBe(
      'w3c-jwt',
    );
  });

  it('detects AnonCreds from schema_id', () => {
    expect(detectFormat({ schema_id: '123', cred_def_id: '456' })).toBe('anoncreds');
  });

  it('defaults to w3c-jsonld for objects', () => {
    expect(detectFormat({ '@context': [], type: ['VerifiableCredential'] })).toBe('w3c-jsonld');
  });
});

describe('extractIssuerDid', () => {
  it('extracts string issuer', () => {
    expect(extractIssuerDid({ issuer: 'did:web:example.com' })).toBe('did:web:example.com');
  });

  it('extracts object issuer', () => {
    expect(extractIssuerDid({ issuer: { id: 'did:web:example.com' } })).toBe(
      'did:web:example.com',
    );
  });

  it('returns empty for missing issuer', () => {
    expect(extractIssuerDid({})).toBe('');
  });
});

describe('extractCredentialSchemaId', () => {
  it('extracts from object credentialSchema', () => {
    expect(
      extractCredentialSchemaId({ credentialSchema: { id: 'https://example.com/schema/1' } }),
    ).toBe('https://example.com/schema/1');
  });

  it('extracts from string credentialSchema', () => {
    expect(extractCredentialSchemaId({ credentialSchema: 'https://example.com/schema/1' })).toBe(
      'https://example.com/schema/1',
    );
  });

  it('extracts from relatedJsonSchemaCredentialId (AnonCreds)', () => {
    expect(extractCredentialSchemaId({ relatedJsonSchemaCredentialId: 'schema-1' })).toBe(
      'schema-1',
    );
  });

  it('returns undefined when missing', () => {
    expect(extractCredentialSchemaId({})).toBeUndefined();
  });
});
