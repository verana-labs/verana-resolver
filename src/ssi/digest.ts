import { createHash } from 'node:crypto';

let _canonicalize: ((obj: unknown) => string) | null = null;

async function getCanonicalizer(): Promise<(obj: unknown) => string> {
  if (_canonicalize === null) {
    const mod = await import('canonicalize');
    _canonicalize = mod.default as unknown as (obj: unknown) => string;
  }
  return _canonicalize;
}

export async function computeDigestSRI(vcJson: Record<string, unknown>): Promise<string> {
  const canonicalize = await getCanonicalizer();
  const canonical = canonicalize(vcJson);
  if (!canonical) {
    throw new Error('Failed to canonicalize VC for digest computation');
  }

  const hash = createHash('sha256').update(canonical, 'utf8').digest('base64');
  return `sha256-${hash}`;
}

export function computeDigestSRISync(canonicalJson: string): string {
  const hash = createHash('sha256').update(canonicalJson, 'utf8').digest('base64');
  return `sha256-${hash}`;
}
