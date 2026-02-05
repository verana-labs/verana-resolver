import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TrustEvaluationEntity } from '../../database/entities';
import { ConsistencyService } from '../shared/consistency.service';

import { GetTrustEvaluationQueryDto } from './dto/get-trust-evaluation-query.dto';

@Injectable()
export class TrustService {
  constructor(
    @InjectRepository(TrustEvaluationEntity)
    private readonly trustRepo: Repository<TrustEvaluationEntity>,
    private readonly consistencyService: ConsistencyService,
  ) {}

  async getTrustEvaluation(did: string, query: GetTrustEvaluationQueryDto) {
    const { vprName } = query;

    const consistencyFilter =
      await this.consistencyService.getConsistencyFilter(vprName);

    let dbQuery = this.trustRepo.createQueryBuilder('evaluation')
      .where('evaluation.id = :id', { id: `${did}:${vprName || 'default'}` });

    if (consistencyFilter.blockHeight) {
      dbQuery = dbQuery.andWhere('evaluation.blockHeight <= :blockHeight', {
        blockHeight: consistencyFilter.blockHeight,
      });
    }

    const evaluation = await dbQuery.getOne();

    if (!evaluation) {
      throw new NotFoundException('Trust evaluation not found');
    }

    return evaluation;
  }
}

