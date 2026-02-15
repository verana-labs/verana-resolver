import { Agent, DidsModule, WebDidResolver, W3cCredentialsModule } from '@credo-ts/core';
import { agentDependencies } from '@credo-ts/node';
import { WebVhModule, WebVhDidResolver } from '@credo-ts/webvh';
import { DrizzleStorageModule } from '@credo-ts/drizzle-storage';
import { coreBundle } from '@credo-ts/drizzle-storage/core';
import { drizzle } from 'drizzle-orm/node-postgres';

let _agent: Agent | null = null;

export async function initializeAgent(postgresUrl: string): Promise<Agent> {
  if (_agent !== null) return _agent;

  const database = drizzle(postgresUrl);

  const agent = new Agent({
    dependencies: agentDependencies,
    modules: {
      drizzleStorage: new DrizzleStorageModule({
        database,
        bundles: [coreBundle],
      }),
      dids: new DidsModule({
        resolvers: [new WebDidResolver(), new WebVhDidResolver()],
      }),
      w3cCredentials: new W3cCredentialsModule(),
      webVh: new WebVhModule(),
    },
  });

  await agent.initialize();
  _agent = agent;
  return agent;
}

export function getAgent(): Agent {
  if (_agent === null) {
    throw new Error('Agent not initialized. Call initializeAgent() first.');
  }
  return _agent;
}

export async function shutdownAgent(): Promise<void> {
  if (_agent !== null) {
    await _agent.shutdown();
    _agent = null;
  }
}
