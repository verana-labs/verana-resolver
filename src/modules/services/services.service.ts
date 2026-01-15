import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ServiceEntity } from '../../database/entities';
import { ConsistencyService } from '../shared/consistency.service';

import { GetServicesQueryDto } from './dto/get-services-query.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(ServiceEntity)
    private readonly serviceRepo: Repository<ServiceEntity>,
    private readonly consistencyService: ConsistencyService,
  ) {}

  async getServices(query: GetServicesQueryDto) {
    const {
      did,
      vprName,
      trustStatus,
      location,
      limit = 10,
      offset = 0,
      orderBy = 'createdAt',
      order = 'DESC',
    } = query;

    let dbQuery = this.serviceRepo.createQueryBuilder('service');

    const consistencyFilter =
      await this.consistencyService.getConsistencyFilter(vprName);
    if (consistencyFilter.blockHeight) {
      dbQuery = dbQuery.andWhere('service.blockHeight <= :blockHeight', {
        blockHeight: consistencyFilter.blockHeight,
      });
    }

    if (vprName) {
      dbQuery = dbQuery.andWhere('service.vprName = :vprName', { vprName });
    }
    if (did) {
      dbQuery = dbQuery.andWhere('service.did = :did', { did });
    }
    if (trustStatus) {
      dbQuery = dbQuery.andWhere('service.trustStatus = :trustStatus', { trustStatus });
    }
    if (location) {
      dbQuery = dbQuery.andWhere('service.location ILIKE :location', { location: `%${location}%` });
    }

    dbQuery = dbQuery
      .orderBy(`service.${orderBy}`, order === 'ASC' ? 'ASC' : 'DESC')
      .take(limit)
      .skip(offset);

    const services = await dbQuery.getMany();
    const total = await dbQuery.getCount();

    return {
      data: services,
      pagination: {
        limit,
        offset,
        total,
      },
    };
  }
}

