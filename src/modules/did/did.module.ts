import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ServiceEntity,
  EcosystemEntity,
  CredentialEntity,
  PermissionEntity,
  ProcessingStateEntity,
} from '../../database/entities';

import { DidController } from './did.controller';
import { DidService } from './did.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceEntity,
      EcosystemEntity,
      CredentialEntity,
      PermissionEntity,
      ProcessingStateEntity,
    ]),
  ],
  controllers: [DidController],
  providers: [DidService],
  exports: [DidService],
})
export class DidModule {}

