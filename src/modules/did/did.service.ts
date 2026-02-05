import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ServiceEntity,
  EcosystemEntity,
  CredentialEntity,
  PermissionEntity,
  ProcessingStateEntity,
} from '../../database/entities';

@Injectable()
export class DidService {
  constructor(
    @InjectRepository(ServiceEntity)
    private readonly serviceRepo: Repository<ServiceEntity>,
    @InjectRepository(EcosystemEntity)
    private readonly ecosystemRepo: Repository<EcosystemEntity>,
    @InjectRepository(CredentialEntity)
    private readonly credentialRepo: Repository<CredentialEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(ProcessingStateEntity)
    private readonly processingStateRepo: Repository<ProcessingStateEntity>,
  ) {}

  async getDidUsage(did: string) {
    const processingStates = await this.processingStateRepo.find();

    const serviceQuery = this.serviceRepo.createQueryBuilder('service').where('service.did = :did', { did });
    const ecosystemQuery = this.ecosystemRepo.createQueryBuilder('ecosystem').where('ecosystem.did = :did', { did });
    const credentialQuery = this.credentialRepo.createQueryBuilder('credential')
      .where('credential.issuerDid = :did OR credential.subjectDid = :did', { did });
    const permissionQuery = this.permissionRepo.createQueryBuilder('permission')
      .where('permission.grantorDid = :did OR permission.granteeDid = :did', { did });

    for (const state of processingStates) {
      if (state.lastProcessedBlock !== null) {
        serviceQuery.orWhere('service.vprName = :vprName AND service.blockHeight <= :blockHeight',
          { vprName: state.vprName, blockHeight: state.lastProcessedBlock });
        ecosystemQuery.orWhere('ecosystem.vprName = :vprName AND ecosystem.blockHeight <= :blockHeight',
          { vprName: state.vprName, blockHeight: state.lastProcessedBlock });
        credentialQuery.orWhere('(credential.issuerDid = :did OR credential.subjectDid = :did) AND credential.vprName = :vprName AND credential.blockHeight <= :blockHeight',
          { did, vprName: state.vprName, blockHeight: state.lastProcessedBlock });
        permissionQuery.orWhere('(permission.grantorDid = :did OR permission.granteeDid = :did) AND permission.vprName = :vprName AND permission.blockHeight <= :blockHeight',
          { did, vprName: state.vprName, blockHeight: state.lastProcessedBlock });
      }
    }

    const [services, ecosystems, credentials, permissions] = await Promise.all([
      serviceQuery.getMany(),
      ecosystemQuery.getMany(),
      credentialQuery.getMany(),
      permissionQuery.getMany(),
    ]);

    const roles = new Set<string>();
    if (services.length > 0) roles.add('service');
    if (ecosystems.length > 0) roles.add('ecosystem');
    if (credentials.some(c => c.issuerDid === did)) roles.add('issuer');
    if (credentials.some(c => c.subjectDid === did)) roles.add('subject');
    if (permissions.some(p => p.grantorDid === did)) roles.add('grantor');
    if (permissions.some(p => p.granteeDid === did)) roles.add('grantee');

    return {
      did,
      roles: Array.from(roles),
      services,
      ecosystems,
      credentials,
      permissions,
    };
  }
}

