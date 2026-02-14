import { Agent, DidsModule, W3cCredentialsModule } from '@credo-ts/core';
import { agentDependencies } from '@credo-ts/node';

let _agent: Agent | null = null;

export async function initializeAgent(): Promise<Agent> {
  if (_agent !== null) return _agent;

  const agent = new Agent({
    dependencies: agentDependencies,
    modules: {
      dids: new DidsModule(),
      w3cCredentials: new W3cCredentialsModule(),
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
