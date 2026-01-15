import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ServiceEntity,
  EcosystemEntity,
  CredentialEntity,
  ProcessingStateEntity,
} from '../../database/entities';

import { SearchQueryDto } from './dto/search-query.dto';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(ServiceEntity)
    private readonly serviceRepo: Repository<ServiceEntity>,
    @InjectRepository(EcosystemEntity)
    private readonly ecosystemRepo: Repository<EcosystemEntity>,
    @InjectRepository(CredentialEntity)
    private readonly credentialRepo: Repository<CredentialEntity>,
    @InjectRepository(ProcessingStateEntity)
    private readonly processingStateRepo: Repository<ProcessingStateEntity>,
  ) {}

  async search(query: SearchQueryDto) {
    const { text } = query;

    if (!text) {
      throw new BadRequestException('Search text is required');
    }

    const searchTerm = `%${text}%`;
    const processingStates = await this.processingStateRepo.find();

    const serviceQueries = processingStates
      .filter(state => state.lastProcessedBlock !== null)
      .map(state => this.serviceRepo.createQueryBuilder('service')
        .where('(service.displayName ILIKE :searchTerm OR service.did ILIKE :searchTerm) AND service.vprName = :vprName AND service.blockHeight <= :blockHeight',
          { searchTerm, vprName: state.vprName, blockHeight: state.lastProcessedBlock })
        .take(20));

    const ecosystemQueries = processingStates
      .filter(state => state.lastProcessedBlock !== null)
      .map(state => this.ecosystemRepo.createQueryBuilder('ecosystem')
        .where('(ecosystem.displayName ILIKE :searchTerm OR ecosystem.did ILIKE :searchTerm) AND ecosystem.vprName = :vprName AND ecosystem.blockHeight <= :blockHeight',
          { searchTerm, vprName: state.vprName, blockHeight: state.lastProcessedBlock })
        .take(20));

    const credentialQueries = processingStates
      .filter(state => state.lastProcessedBlock !== null)
      .map(state => this.credentialRepo.createQueryBuilder('credential')
        .where('(credential.issuerDid ILIKE :searchTerm OR credential.subjectDid ILIKE :searchTerm) AND credential.vprName = :vprName AND credential.blockHeight <= :blockHeight',
          { searchTerm, vprName: state.vprName, blockHeight: state.lastProcessedBlock })
        .take(20));

    const [services, ecosystems, credentials] = await Promise.all([
      Promise.all(serviceQueries.map(q => q.getMany())).then(results => results.flat()),
      Promise.all(ecosystemQueries.map(q => q.getMany())).then(results => results.flat()),
      Promise.all(credentialQueries.map(q => q.getMany())).then(results => results.flat()),
    ]);

    return {
      services,
      ecosystems,
      credentials,
    };
  }
}

