import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { config } from './config';
import {
  ProcessingStateEntity,
  ReattemptableResourceEntity,
  CachedObjectEntity,
  TrustEvaluationEntity,
  ServiceEntity,
  EcosystemEntity,
  CredentialEntity,
  PermissionEntity,
} from './database/entities';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { DatabaseModule } from './modules/database/database.module';
import { DidModule } from './modules/did/did.module';
import { EcosystemsModule } from './modules/ecosystems/ecosystems.module';
import { HealthModule } from './modules/health/health.module';
import { ProcessingModule } from './modules/processing/processing.module';
import { SearchModule } from './modules/search/search.module';
import { ServicesModule } from './modules/services/services.module';
import { SharedModule } from './modules/shared/shared.module';
import { TrustModule } from './modules/trust/trust.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: config.database.host,
      port: config.database.port,
      username: config.database.username,
      password: config.database.password,
      database: config.database.database,
      synchronize: config.database.synchronize,
      logging: config.database.logging,
      entities: [
        ProcessingStateEntity,
        ReattemptableResourceEntity,
        CachedObjectEntity,
        TrustEvaluationEntity,
        ServiceEntity,
        EcosystemEntity,
        CredentialEntity,
        PermissionEntity,
      ],
    }),
    SharedModule,
    DatabaseModule,
    ProcessingModule,
    HealthModule,
    ServicesModule,
    EcosystemsModule,
    CredentialsModule,
    DidModule,
    SearchModule,
    TrustModule,
  ],
})
export class AppModule {}

