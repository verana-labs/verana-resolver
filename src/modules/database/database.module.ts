import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ProcessingStateEntity,
  ReattemptableResourceEntity,
  CachedObjectEntity,
  TrustEvaluationEntity,
  ServiceEntity,
  EcosystemEntity,
  CredentialEntity,
  PermissionEntity,
} from '../../database/entities';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProcessingStateEntity,
      ReattemptableResourceEntity,
      CachedObjectEntity,
      TrustEvaluationEntity,
      ServiceEntity,
      EcosystemEntity,
      CredentialEntity,
      PermissionEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}

