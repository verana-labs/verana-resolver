import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

import { ResolverConfigSchema, type ResolverConfig, type VprConfig } from './types';

function parseVprFromEnv(): VprConfig[] {
  const vprName = process.env.VPR_NAME;
  const vprUrls = process.env.VPR_BASE_URLS;
  const vprVersion = process.env.VPR_VERSION || '1';
  const vprProduction = process.env.VPR_PRODUCTION !== 'false';

  if (!vprName || !vprUrls) {
    return [];
  }

  const baseurls = vprUrls.split(',').map(url => url.trim()).filter(Boolean);
  if (baseurls.length === 0) {
    return [];
  }

  return [
    {
      name: vprName,
      baseurls,
      version: vprVersion,
      production: vprProduction,
    },
  ];
}

function parseEcsEcosystemsFromEnv(): Array<{ did: string; vpr: string }> {
  const ecsDids = process.env.ECS_ECOSYSTEM_DIDS;
  const ecsVprs = process.env.ECS_ECOSYSTEM_VPRS;

  if (!ecsDids || !ecsVprs) {
    return [];
  }

  const dids = ecsDids.split(',').map(d => d.trim()).filter(Boolean);
  const vprs = ecsVprs.split(',').map(v => v.trim()).filter(Boolean);

  if (dids.length !== vprs.length) {
    console.warn('ECS ecosystem DIDs and VPRs count mismatch, skipping');
    return [];
  }

  return dids
    .map((did, index) => ({
      did,
      vpr: vprs[index] || '',
    }))
    .filter(item => item.vpr !== '');
}

export function loadConfig(): ResolverConfig {
  let configData: any = {};
  let configPath: string | null = null;

  if (process.env.CONFIG_PATH) {
    configPath = process.env.CONFIG_PATH;
  } else {
    const devPath = join(process.cwd(), 'src', 'config', 'config.json');
    const prodPath = join(__dirname, 'config.json');
    const distPath = join(process.cwd(), 'dist', 'config', 'config.json');

    if (existsSync(devPath)) {
      configPath = devPath;
    } else if (existsSync(prodPath)) {
      configPath = prodPath;
    } else if (existsSync(distPath)) {
      configPath = distPath;
    }
  }

  if (configPath) {
    try {
      configData = JSON.parse(readFileSync(configPath, 'utf-8'));
      console.log(`Loaded config from: ${configPath}`);
    } catch (error) {
      console.warn(`Failed to load config from ${configPath}:`, error);
    }
  } else {
    console.log('No config.json found, using environment variables and defaults');
  }

  const config: any = {
    pollInterval: process.env.POLL_INTERVAL
      ? parseInt(process.env.POLL_INTERVAL, 10)
      : configData.pollInterval || 10,
    cacheTtl: process.env.CACHE_TTL
      ? parseInt(process.env.CACHE_TTL, 10)
      : configData.cacheTtl || 3600,
    trustTtl: process.env.TRUST_TTL
      ? parseInt(process.env.TRUST_TTL, 10)
      : configData.trustTtl || 1800,
    objectCachingRetryDays: process.env.OBJECT_CACHING_RETRY_DAYS
      ? parseInt(process.env.OBJECT_CACHING_RETRY_DAYS, 10)
      : configData.objectCachingRetryDays || configData.pollObjectCachingRetryDays || 7,
    database: {
      host: process.env.DB_HOST || configData.database?.host || 'localhost',
      port: process.env.DB_PORT
        ? parseInt(process.env.DB_PORT, 10)
        : configData.database?.port || 5435,
      database: process.env.DB_NAME || configData.database?.database || 'verana_resolver',
      username: process.env.DB_USER || configData.database?.username || 'verana_resolver_user',
      password: process.env.DB_PASSWORD || configData.database?.password || '',
      synchronize:
        process.env.DB_SYNCHRONIZE === 'true' ||
        configData.database?.synchronize === true ||
        false,
      logging: process.env.DB_LOGGING === 'true' || configData.database?.logging === true || false,
    },
    api: {
      port: process.env.API_PORT
        ? parseInt(process.env.API_PORT, 10)
        : configData.api?.port || 4000,
    },
    verifiablePublicRegistries:
      parseVprFromEnv().length > 0
        ? parseVprFromEnv()
        : configData.verifiablePublicRegistries || [],
    ecsEcosystems:
      parseEcsEcosystemsFromEnv().length > 0
        ? parseEcsEcosystemsFromEnv()
        : configData.ecsEcosystems || [],
    logLevel: (process.env.LOG_LEVEL || configData.logLevel || 'info') as
      | 'error'
      | 'warn'
      | 'info'
      | 'debug',
  };

  return ResolverConfigSchema.parse(config);
}

export const config = loadConfig();
