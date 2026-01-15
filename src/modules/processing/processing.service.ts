import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { config } from '../../config';
import { ProcessingStateEntity, ReattemptableResourceEntity } from '../../database/entities';
import { IndexerClient } from '../../indexer/client';

@Injectable()
export class ProcessingService implements OnModuleInit, OnModuleDestroy {
  private indexerClient: IndexerClient;
  private processingStateRepo: Repository<ProcessingStateEntity>;
  private reattemptableResourceRepo: Repository<ReattemptableResourceEntity>;

  constructor(
    @InjectRepository(ProcessingStateEntity)
      processingStateRepo: Repository<ProcessingStateEntity>,
    @InjectRepository(ReattemptableResourceEntity)
      reattemptableResourceRepo: Repository<ReattemptableResourceEntity>,
  ) {
    this.indexerClient = new IndexerClient();
    this.processingStateRepo = processingStateRepo;
    this.reattemptableResourceRepo = reattemptableResourceRepo;
  }

  async onModuleInit() {
    console.log('Starting Verana Trust Resolver...');

    console.log('Testing indexer connectivity...');
    for (const vpr of config.verifiablePublicRegistries) {
      try {
        const connectivity = await this.testConnectivity(vpr.name);
        if (!connectivity.connected) {
          console.warn(`VPR ${vpr.name} indexer not reachable`);
          if (connectivity.errors.length > 0) {
            console.warn(`Connection errors: ${connectivity.errors.join('; ')}`);
          }
        } else {
          console.log(`${vpr.name} connected - BlockHeight: ${connectivity.blockHeightAvailable}, WebSocket: ${connectivity.webSocketAvailable}`);
        }
      } catch (error) {
        console.error(`Failed to test compatibility for VPR ${vpr.name}:`, error);
      }
    }

    await this.performInitialSyncIfNeeded();
    this.startWebSocketConnections();
  }

  async onModuleDestroy() {
    console.log('Received shutdown signal, shutting down gracefully...');
    this.stopWebSocketConnections();
    this.cleanup();
  }

  async testConnectivity(vprName: string): Promise<{
    connected: boolean;
    blockHeightAvailable: boolean;
    webSocketAvailable: boolean;
    errors: string[];
  }> {
    return await this.indexerClient.testConnectivity(vprName);
  }

  async performInitialSyncIfNeeded(): Promise<void> {
    console.log('Checking if initial sync is needed...');

    for (const vpr of config.verifiablePublicRegistries) {
      const lastProcessedBlock = await this.getLastProcessedBlock(vpr.name);
      if (lastProcessedBlock === null) {
        console.log(`Performing initial sync for ${vpr.name}...`);
        const blockHeightResponse = await this.indexerClient.getBlockHeight(vpr.name);
        const currentBlockHeight = blockHeightResponse.height;
        await this.performInitialSync(vpr.name, 0, currentBlockHeight);
        console.log(`Initial sync completed for ${vpr.name}`);
      } else {
        console.log(`${vpr.name} already synced up to block ${lastProcessedBlock}`);
      }
    }
  }

  private startWebSocketConnections(): void {
    console.log('Starting WebSocket connections for real-time block processing...');

    for (const vpr of config.verifiablePublicRegistries) {
      const ws = this.indexerClient.connectWebSocket(vpr.name, async (event) => {
        console.log(`WebSocket event received for ${vpr.name}: Block ${event.height} processed at ${event.timestamp}`);
        await this.handleBlockProcessed(vpr.name, event.height);
      });

      if (ws) {
        console.log(`WebSocket connection established for ${vpr.name}`);
      } else {
        console.error(`Failed to establish WebSocket connection for ${vpr.name}, falling back to polling`);
        this.startPollingFallback(vpr.name);
      }
    }
  }

  private pollingFallbacks = new Map<string, NodeJS.Timeout>();

  private startPollingFallback(vprName: string): void {
    console.log(`Starting polling fallback for ${vprName}...`);
    const interval = setInterval(() => {
      this.runIngestionCycle(vprName).catch((error) => {
        console.error(`Polling fallback cycle failed for ${vprName}:`, error);
      });
    }, config.pollInterval * 1000);
    this.pollingFallbacks.set(vprName, interval);
  }

  private stopWebSocketConnections(): void {
    console.log('Stopping WebSocket connections...');
    for (const vpr of config.verifiablePublicRegistries) {
      this.indexerClient.disconnectWebSocket(vpr.name);
      console.log(`WebSocket disconnected for ${vpr.name}`);
    }

    for (const [vprName, interval] of this.pollingFallbacks) {
      clearInterval(interval);
      console.log(`Polling fallback stopped for ${vprName}`);
    }
    this.pollingFallbacks.clear();
  }

  private async handleBlockProcessed(vprName: string, blockHeight: number): Promise<void> {
    try {
      const lastProcessedBlock = await this.getLastProcessedBlock(vprName);

      if (lastProcessedBlock === null) {
        console.log(`No processing state found for ${vprName}, performing initial sync up to block ${blockHeight}...`);
        await this.performInitialSync(vprName, 0, blockHeight);
        return;
      }

      if (blockHeight <= lastProcessedBlock) {
        console.log(`Block ${blockHeight} already processed (last: ${lastProcessedBlock}), skipping`);
        return;
      }

      const startBlock = lastProcessedBlock + 1;
      console.log(`Processing blocks ${startBlock} to ${blockHeight} for ${vprName}`);

      for (let target = startBlock; target <= blockHeight; target++) {
        try {
          await this.processBlock(vprName, target);
          await this.updateLastProcessedBlock(vprName, target);
        } catch (error) {
          console.error(`Failed to process block ${target} for ${vprName}:`, error);
          throw error;
        }
      }

      await this.processReattemptableResources();
    } catch (error) {
      console.error(`Failed to handle block processed event for ${vprName} block ${blockHeight}:`, error);
    }
  }

  private async runIngestionCycle(vprName: string): Promise<void> {
    try {
      await this.processIncrementalSync(vprName);
    } catch (error) {
      console.error(`Ingestion cycle failed for ${vprName}:`, error);
      throw error;
    }
  }

  private async processIncrementalSync(vprName: string): Promise<void> {
    try {
      const lastProcessedBlock = await this.getLastProcessedBlock(vprName);

      if (lastProcessedBlock === null) {
        console.log(`No processing state found for ${vprName}, performing initial sync...`);
        const blockHeightResponse = await this.indexerClient.getBlockHeight(vprName);
        const currentBlockHeight = blockHeightResponse.height;
        await this.performInitialSync(vprName, 0, currentBlockHeight);
        return;
      }

      const blockHeightResponse = await this.indexerClient.getBlockHeight(vprName);
      const currentBlockHeight = blockHeightResponse.height;

      if (currentBlockHeight <= lastProcessedBlock) {
        return;
      }

      while (lastProcessedBlock < currentBlockHeight) {
        const target = lastProcessedBlock + 1;

        try {
          await this.processBlock(vprName, target);
          await this.updateLastProcessedBlock(vprName, target);
        } catch (error) {
          console.error(`Failed to process block ${target} for ${vprName}:`, error);
          throw error;
        }
      }

      await this.processReattemptableResources();
    } catch (error) {
      console.error(`Failed to process incremental sync for ${vprName}:`, error);
      throw error;
    }
  }

  private async performInitialSync(
    vprName: string,
    startBlock: number,
    endBlock: number,
  ): Promise<void> {
    const actualStartBlock = Math.max(0, startBlock);
    console.log(`Initial sync: Processing blocks ${actualStartBlock} to ${endBlock} for ${vprName}`);
    console.log(`Total blocks to process: ${endBlock - actualStartBlock + 1}`);

    let processedCount = 0;
    for (let blockHeight = actualStartBlock; blockHeight <= endBlock; blockHeight++) {
      try {
        processedCount++;
        const progress = ((processedCount / (endBlock - actualStartBlock + 1)) * 100).toFixed(1);
        console.log(`Initial sync: Processing block ${blockHeight}/${endBlock} (${progress}%) for ${vprName}`);
        await this.processBlock(vprName, blockHeight);
        await this.updateLastProcessedBlock(vprName, blockHeight);
        console.log(`Block ${blockHeight} processed successfully during initial sync`);
      } catch (error) {
        console.error(`Failed to process block ${blockHeight} during initial sync for ${vprName}:`, error);
        throw error;
      }
    }

    console.log(`Initial sync completed: all blocks from ${actualStartBlock} to ${endBlock} processed for ${vprName}`);
  }

  private async processBlock(vprName: string, blockHeight: number): Promise<void> {
    console.log(`Processing block ${blockHeight} for ${vprName}`);

    try {
      const changes = await this.indexerClient.listChanges(vprName, blockHeight);
      console.log(`Found ${changes.changes.length} changes in block ${blockHeight}`);

      for (const change of changes.changes) {
        await this.executePass1(vprName, change, blockHeight);
      }

      await this.processReattemptableResources();

      await this.executePass2(vprName, blockHeight);

      await this.processReattemptableResources();

      console.log(`Block ${blockHeight} processing completed successfully`);
    } catch (error) {
      console.error(`Block ${blockHeight} processing failed:`, error);
      throw error;
    }
  }

  private async executePass1(vprName: string, change: any, blockHeight: number): Promise<void> {
    console.log(`Pass1: Processing ${change.entity_type}:${change.entity_id} (${change.operation}) at block ${blockHeight}`);
  }

  private async executePass2(vprName: string, blockHeight: number): Promise<void> {
    console.log(`Pass2: Trust evaluation for block ${blockHeight} on ${vprName}`);
  }

  private async getLastProcessedBlock(vprName: string): Promise<number | null> {
    const state = await this.processingStateRepo.findOne({
      where: { vprName },
    });
    if (!state || state.lastProcessedBlock === null || state.lastProcessedBlock === undefined) {
      return null;
    }
    return state.lastProcessedBlock;
  }

  private async updateLastProcessedBlock(vprName: string, blockHeight: number): Promise<void> {
    try {
      console.log(`Updating lastProcessedBlock for ${vprName} to ${blockHeight}`);
      await this.processingStateRepo.save({
        vprName,
        lastProcessedBlock: blockHeight,
      });
      console.log('lastProcessedBlock updated successfully');
    } catch (error) {
      console.error('Failed to update lastProcessedBlock:', error);
      throw error;
    }
  }

  private async processReattemptableResources(): Promise<void> {
    const resources = await this.reattemptableResourceRepo.find({
      take: 10,
    });

    for (const resource of resources) {
      try {
        console.log(`Retrying resource: ${resource.id}`);
        await this.reattemptableResourceRepo.remove(resource);
      } catch (error) {
        console.error(`Failed to retry resource ${resource.id}:`, error);
        resource.retryCount += 1;
        await this.reattemptableResourceRepo.save(resource);
      }
    }
  }

  cleanup(): void {
    console.log('Cleaning up processing engine...');
    this.stopWebSocketConnections();
    this.indexerClient.cleanup();
    console.log('Processing engine cleanup complete');
  }
}

