import { describe, it, expect } from 'vitest';
import { ECS } from '@verana-labs/verre';
import type { IOrg, IPersona, IService } from '@verana-labs/verre';
import { extractClaimsFromCredential } from '../src/polling/verre-pass.js';

const service: IService = {
  schemaType: ECS.SERVICE,
  id: 'did:web:service.example',
  issuer: 'did:web:issuer.example',
  name: 'Acme Portal',
  type: 'WebService',
  description: 'Acme customer portal',
  logo: 'https://service.example/logo.png',
  minimumAgeRequired: 0,
  termsAndConditions: 'https://service.example/terms',
  privacyPolicy: 'https://service.example/privacy',
};

const org: IOrg = {
  schemaType: ECS.ORG,
  id: 'did:web:service.example',
  issuer: 'did:web:ecs.example',
  name: 'Acme Corp',
  logo: 'https://service.example/org-logo.png',
  registryId: 'BE0123456789',
  address: 'Rue de la Loi 1, 1000 Brussels',
  countryCode: 'BE',
};

const persona: IPersona = {
  schemaType: ECS.PERSONA,
  id: 'did:web:persona.example',
  issuer: 'did:web:ecs.example',
  name: '@fabrice',
  avatar: 'https://persona.example/avatar.png',
  controllerCountryCode: 'CO',
};

describe('extractClaimsFromCredential', () => {
  it('keeps the service logo alongside the other ECS-SERVICE claims', () => {
    const claims = extractClaimsFromCredential(service);
    expect(claims.name).toBe('Acme Portal');
    expect(claims.logo).toBe('https://service.example/logo.png');
    expect(claims.termsAndConditions).toBe('https://service.example/terms');
  });

  it('keeps the organization logo alongside the other ECS-ORG claims', () => {
    const claims = extractClaimsFromCredential(org);
    expect(claims.name).toBe('Acme Corp');
    expect(claims.logo).toBe('https://service.example/org-logo.png');
    expect(claims.countryCode).toBe('BE');
  });

  it('keeps the persona avatar alongside the other ECS-PERSONA claims', () => {
    const claims = extractClaimsFromCredential(persona);
    expect(claims.name).toBe('@fabrice');
    expect(claims.avatar).toBe('https://persona.example/avatar.png');
    expect(claims.controllerCountryCode).toBe('CO');
  });
});
