import { DataSource } from 'typeorm';

import { config } from '../config';

import {
  ProcessingStateEntity,
  ReattemptableResourceEntity,
  CachedObjectEntity,
  TrustEvaluationEntity,
  ServiceEntity,
  EcosystemEntity,
  CredentialEntity,
  PermissionEntity,
} from './entities';

export const AppDataSource = new DataSource({
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
  subscribers: [],
  migrations: [],
});

export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();
    console.log('Database connection established successfully');

    const queryRunner = AppDataSource.createQueryRunner();
    const tableExists = await queryRunner.hasTable('processing_state');
    if (!tableExists) {
      console.log('Processing state table does not exist yet - will be created by TypeORM synchronize');
    }
    await queryRunner.release();
  } catch (error) {
    console.error('Error during database initialization:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
    }
    throw error;
  }
}


