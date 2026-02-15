import { Agent, DidsModule, WebDidResolver, W3cCredentialsModule } from '@credo-ts/core';
import { agentDependencies } from '@credo-ts/node';
import { WebVhModule } from '@credo-ts/webvh';

let _agent: Agent | null = null;

export async function initializeAgent(): Promise<Agent> {
  if (_agent !== null) return _agent;

  const agent = new Agent({
    dependencies: agentDependencies,
    modules: {
      dids: new DidsModule({
        resolvers: [new WebDidResolver()],
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
