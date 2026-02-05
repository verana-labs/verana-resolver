import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ServiceEntity,
  EcosystemEntity,
  CredentialEntity,
  ProcessingStateEntity,
} from '../../database/entities';

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceEntity,
      EcosystemEntity,
      CredentialEntity,
      ProcessingStateEntity,
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}

