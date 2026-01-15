import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TrustEvaluationEntity } from '../../database/entities';

import { TrustController } from './trust.controller';
import { TrustService } from './trust.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrustEvaluationEntity])],
  controllers: [TrustController],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}

