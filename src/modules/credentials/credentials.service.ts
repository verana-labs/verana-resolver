import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CredentialEntity } from '../../database/entities';
import { ConsistencyService } from '../shared/consistency.service';

import { GetCredentialsQueryDto } from './dto/get-credentials-query.dto';

@Injectable()
export class CredentialsService {
  constructor(
    @InjectRepository(CredentialEntity)
    private readonly credentialRepo: Repository<CredentialEntity>,
    private readonly consistencyService: ConsistencyService,
  ) {}

  async getCredentials(query: GetCredentialsQueryDto) {
    const {
      schemaId,
      vprName,
      issuerDid,
      subjectDid,
      valid,
      limit = 10,
      offset = 0,
      orderBy = 'createdAt',
      order = 'DESC',
    } = query;

    let dbQuery = this.credentialRepo.createQueryBuilder('credential');

    const consistencyFilter =
      await this.consistencyService.getConsistencyFilter(vprName);
    if (consistencyFilter.blockHeight) {
      dbQuery = dbQuery.andWhere('credential.blockHeight <= :blockHeight', {
        blockHeight: consistencyFilter.blockHeight,
      });
    }

    if (vprName) {
      dbQuery = dbQuery.andWhere('credential.vprName = :vprName', { vprName });
    }
    if (schemaId) {
      dbQuery = dbQuery.andWhere('credential.schemaId = :schemaId', { schemaId });
    }
    if (issuerDid) {
      dbQuery = dbQuery.andWhere('credential.issuerDid = :issuerDid', { issuerDid });
    }
    if (subjectDid) {
      dbQuery = dbQuery.andWhere('credential.subjectDid = :subjectDid', { subjectDid });
    }
    if (valid !== undefined) {
      dbQuery = dbQuery.andWhere('credential.valid = :valid', { valid });
    }

    dbQuery = dbQuery
      .orderBy(`credential.${orderBy}`, order === 'ASC' ? 'ASC' : 'DESC')
      .take(limit)
      .skip(offset);

    const credentials = await dbQuery.getMany();
    const total = await dbQuery.getCount();

    return {
      data: credentials,
      pagination: {
        limit,
        offset,
        total,
      },
    };
  }
}

