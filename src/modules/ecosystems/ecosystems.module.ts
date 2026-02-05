import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EcosystemEntity } from '../../database/entities';

import { EcosystemsController } from './ecosystems.controller';
import { EcosystemsService } from './ecosystems.service';

@Module({
  imports: [TypeOrmModule.forFeature([EcosystemEntity])],
  controllers: [EcosystemsController],
  providers: [EcosystemsService],
  exports: [EcosystemsService],
})
export class EcosystemsModule {}

