import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProcessingStateEntity, ReattemptableResourceEntity } from '../../database/entities';

import { ProcessingService } from './processing.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProcessingStateEntity, ReattemptableResourceEntity])],
  providers: [ProcessingService],
  exports: [ProcessingService],
})
export class ProcessingModule {}

