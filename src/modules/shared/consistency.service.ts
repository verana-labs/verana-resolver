import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProcessingStateEntity } from '../../database/entities';

@Injectable()
export class ConsistencyService {
  constructor(
    @InjectRepository(ProcessingStateEntity)
    private readonly processingRepo: Repository<ProcessingStateEntity>,
  ) {}

  async getConsistencyFilter(vprName?: string): Promise<{ blockHeight?: number }> {
    if (!vprName) {
      const states = await this.processingRepo.find();
      if (states.length === 0) return {};

      const minBlockHeight = Math.min(...states.map(s => s.lastProcessedBlock || 0));
      return minBlockHeight > 0 ? { blockHeight: minBlockHeight } : {};
    }

    const state = await this.processingRepo.findOne({ where: { vprName } });
    return state?.lastProcessedBlock ? { blockHeight: state.lastProcessedBlock } : {};
  }
}

