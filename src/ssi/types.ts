export interface ResolvedDIDDocument {
  did: string;
  didDocument: Record<string, unknown>;
  cachedAt: number;
  validUntil?: string;
}

export interface LinkedVPEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DereferencedVP {
  vpUrl: string;
  vp: Record<string, unknown>;
  credentials: DereferencedVC[];
  cachedAt: number;
}

export interface DereferencedVC {
  vcId: string;
  vc: Record<string, unknown>;
  format: 'w3c-jsonld' | 'w3c-jwt' | 'anoncreds';
  issuerDid: string;
  credentialSchemaId?: string;
  effectiveIssuanceTime?: string;
  digestSRI?: string;
  verified: boolean;
  verificationError?: string;
}

export interface DereferenceError {
  resource: string;
  resourceType: 'did-document' | 'vp' | 'vc';
  error: string;
  timestamp: number;
}
