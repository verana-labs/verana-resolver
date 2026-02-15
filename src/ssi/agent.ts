import { askar, KdfMethod } from '@openwallet-foundation/askar-nodejs';
import { AskarModule } from '@credo-ts/askar';
import { Agent, DidsModule, WebDidResolver, W3cCredentialsModule } from '@credo-ts/core';
import { agentDependencies } from '@credo-ts/node';
import { WebVhModule, WebVhDidResolver } from '@credo-ts/webvh';

let _agent: Agent | null = null;

export async function initializeAgent(_postgresUrl?: string): Promise<Agent> {
  if (_agent !== null) return _agent;

  const agent = new Agent({
    dependencies: agentDependencies,
    modules: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      askar: new AskarModule({
        askar: askar as any,
        store: {
          id: `verana-resolver-${Date.now()}`,
          key: 'verana-resolver-key',
          keyDerivationMethod: KdfMethod.Raw as any,
        },
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
