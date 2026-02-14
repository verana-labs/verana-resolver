import type {
  BlockHeightResponse,
  ChangesResponse,
  TrustRegistryResponse,
  CredentialSchemaResponse,
  CredentialSchemaListResponse,
  PermissionResponse,
  PermissionListResponse,
  PermissionSessionResponse,
  BeneficiaryResponse,
  TrustDepositResponse,
  DigestResponse,
  ExchangeRateResponse,
  PriceResponse,
  ListPermissionsParams,
  ListCredentialSchemasParams,
  ListTrustRegistriesParams,
  TrustRegistryListResponse,
  GetExchangeRateParams,
  GetPriceParams,
} from './types.js';
import { IndexerError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_RETRIES = 2;
const RETRY_BASE_MS = 200;

export class IndexerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly memo: Map<string, Promise<unknown>> = new Map();

  constructor(indexerUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.baseUrl = indexerUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  clearMemo(): void {
    this.memo.clear();
  }

  // --- Indexer ---

  async getBlockHeight(): Promise<BlockHeightResponse> {
    return this.get<BlockHeightResponse>('/verana/indexer/v1/block-height');
  }

  async listChanges(blockHeight: number): Promise<ChangesResponse> {
    return this.get<ChangesResponse>(`/verana/indexer/v1/changes/${blockHeight}`);
  }

  // --- Trust Registry ---

  async getTrustRegistry(
    id: string,
    atBlock?: number,
  ): Promise<TrustRegistryResponse> {
    return this.get<TrustRegistryResponse>(`/verana/tr/v1/get/${id}`, {}, atBlock);
  }

  async listTrustRegistries(
    params: ListTrustRegistriesParams = {},
    atBlock?: number,
  ): Promise<TrustRegistryListResponse> {
    return this.get<TrustRegistryListResponse>('/verana/tr/v1/list', { ...params }, atBlock);
  }

  // --- Credential Schema ---

  async getCredentialSchema(
    id: string,
    atBlock?: number,
  ): Promise<CredentialSchemaResponse> {
    return this.get<CredentialSchemaResponse>(`/verana/cs/v1/get/${id}`, {}, atBlock);
  }

  async listCredentialSchemas(
    params: ListCredentialSchemasParams = {},
    atBlock?: number,
  ): Promise<CredentialSchemaListResponse> {
    return this.get<CredentialSchemaListResponse>('/verana/cs/v1/list', { ...params }, atBlock);
  }

  // --- Permissions ---

  async getPermission(
    id: string,
    atBlock?: number,
  ): Promise<PermissionResponse> {
    return this.get<PermissionResponse>(`/verana/perm/v1/get/${id}`, {}, atBlock);
  }

  async listPermissions(
    params: ListPermissionsParams = {},
    atBlock?: number,
  ): Promise<PermissionListResponse> {
    return this.get<PermissionListResponse>('/verana/perm/v1/list', { ...params }, atBlock);
  }

  async getPermissionSession(
    id: string,
    atBlock?: number,
  ): Promise<PermissionSessionResponse> {
    return this.get<PermissionSessionResponse>(`/verana/perm/v1/session/get/${id}`, {}, atBlock);
  }

  async findBeneficiaries(
    issuerPermId: string,
    verifierPermId: string,
    atBlock?: number,
  ): Promise<BeneficiaryResponse> {
    return this.get<BeneficiaryResponse>('/verana/perm/v1/beneficiaries', {
      issuer_perm_id: issuerPermId,
      verifier_perm_id: verifierPermId,
    }, atBlock);
  }

  // --- Trust Deposit ---

  async getTrustDepositByAccount(
    account: string,
    atBlock?: number,
  ): Promise<TrustDepositResponse> {
    return this.get<TrustDepositResponse>(`/verana/td/v1/get/${account}`, {}, atBlock);
  }

  // --- Digest ---

  async getDigest(
    digestSri: string,
    atBlock?: number,
  ): Promise<DigestResponse> {
    return this.get<DigestResponse>(`/verana/di/v1/get/${encodeURIComponent(digestSri)}`, {}, atBlock);
  }

  // --- Exchange Rate ---

  async getExchangeRate(
    params: GetExchangeRateParams,
    atBlock?: number,
  ): Promise<ExchangeRateResponse> {
    return this.get<ExchangeRateResponse>('/verana/xr/v1/get', { ...params }, atBlock);
  }

  async getPrice(
    params: GetPriceParams,
    atBlock?: number,
  ): Promise<PriceResponse> {
    return this.get<PriceResponse>('/verana/xr/v1/price', { ...params }, atBlock);
  }

  // --- Internal ---

  private async get<T>(
    path: string,
    params: Record<string, unknown> = {},
    atBlock?: number,
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const memoKey = atBlock !== undefined ? `${url}@${atBlock}` : url;

    const existing = this.memo.get(memoKey);
    if (existing) return existing as Promise<T>;

    const promise = this.fetchWithRetry<T>(url, atBlock);
    this.memo.set(memoKey, promise);
    return promise;
  }

  private async fetchWithRetry<T>(url: string, atBlock?: number, attempt = 0): Promise<T> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (atBlock !== undefined) {
      headers['At-Block-Height'] = String(atBlock);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        return (await response.json()) as T;
      }

      if (response.status === 404) {
        throw new IndexerError(
          `Not found: ${url}`,
          404,
          'NOT_FOUND',
        );
      }

      if (response.status === 400) {
        const body = await response.text();
        throw new IndexerError(
          `Bad request: ${url} \u2014 ${body}`,
          400,
          'BAD_REQUEST',
        );
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await this.backoff(attempt);
        return this.fetchWithRetry<T>(url, atBlock, attempt + 1);
      }

      throw new IndexerError(
        `Server error ${response.status}: ${url}`,
        response.status,
        'SERVER',
      );
    } catch (err) {
      if (err instanceof IndexerError) throw err;

      if (err instanceof DOMException && err.name === 'AbortError') {
        if (attempt < MAX_RETRIES) {
          await this.backoff(attempt);
          return this.fetchWithRetry<T>(url, atBlock, attempt + 1);
        }
        throw new IndexerError(`Timeout: ${url}`, null, 'TIMEOUT');
      }

      if (attempt < MAX_RETRIES) {
        await this.backoff(attempt);
        return this.fetchWithRetry<T>(url, atBlock, attempt + 1);
      }

      throw new IndexerError(
        `Network error: ${url} \u2014 ${String(err)}`,
        null,
        'NETWORK',
      );
    }
  }

  buildUrl(path: string, params: Record<string, unknown> = {}): string {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async backoff(attempt: number): Promise<void> {
    const ms = RETRY_BASE_MS * Math.pow(2, attempt);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
