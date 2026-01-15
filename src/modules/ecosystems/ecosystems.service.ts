import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EcosystemEntity } from '../../database/entities';
import { ConsistencyService } from '../shared/consistency.service';

import { GetEcosystemsQueryDto } from './dto/get-ecosystems-query.dto';

@Injectable()
export class EcosystemsService {
  constructor(
    @InjectRepository(EcosystemEntity)
    private readonly ecosystemRepo: Repository<EcosystemEntity>,
    private readonly consistencyService: ConsistencyService,
  ) {}

  async getEcosystems(query: GetEcosystemsQueryDto) {
    const {
      did,
      vprName,
      trustRegistryDid,
      limit = 10,
      offset = 0,
      orderBy = 'createdAt',
      order = 'DESC',
    } = query;

    let dbQuery = this.ecosystemRepo.createQueryBuilder('ecosystem');

    const consistencyFilter =
      await this.consistencyService.getConsistencyFilter(vprName);
    if (consistencyFilter.blockHeight) {
      dbQuery = dbQuery.andWhere('ecosystem.blockHeight <= :blockHeight', {
        blockHeight: consistencyFilter.blockHeight,
      });
    }

    if (vprName) {
      dbQuery = dbQuery.andWhere('ecosystem.vprName = :vprName', { vprName });
    }
    if (did) {
      dbQuery = dbQuery.andWhere('ecosystem.did = :did', { did });
    }
    if (trustRegistryDid) {
      dbQuery = dbQuery.andWhere('ecosystem.trustRegistryDid = :trustRegistryDid', { trustRegistryDid });
    }

    dbQuery = dbQuery
      .orderBy(`ecosystem.${orderBy}`, order === 'ASC' ? 'ASC' : 'DESC')
      .take(limit)
      .skip(offset);

    const ecosystems = await dbQuery.getMany();
    const total = await dbQuery.getCount();

    return {
      data: ecosystems,
      pagination: {
        limit,
        offset,
        total,
      },
    };
  }
}

