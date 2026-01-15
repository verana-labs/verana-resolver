import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProcessingStateEntity } from '../../database/entities';

import { ConsistencyService } from './consistency.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ProcessingStateEntity])],
  providers: [ConsistencyService],
  exports: [ConsistencyService],
})
export class SharedModule {}

