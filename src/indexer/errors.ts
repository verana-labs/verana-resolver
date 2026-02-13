export class IndexerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number | null,
    public readonly errorType: 'NETWORK' | 'NOT_FOUND' | 'SERVER' | 'BAD_REQUEST' | 'TIMEOUT',
  ) {
    super(message);
    this.name = 'IndexerError';
  }
}

export function isNotFound(err: unknown): boolean {
  return err instanceof IndexerError && err.errorType === 'NOT_FOUND';
}
