import { AppDataSource } from './index';

export async function resetDatabase(): Promise<void> {
  try {
    console.log('Resetting database...');

    await AppDataSource.query(`
      DROP TABLE IF EXISTS trust_evaluations CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS ecosystems CASCADE;
      DROP TABLE IF EXISTS credentials CASCADE;
      DROP TABLE IF EXISTS permissions CASCADE;
      DROP TABLE IF EXISTS cached_objects CASCADE;
      DROP TABLE IF EXISTS reattemptable_resources CASCADE;
      DROP TABLE IF EXISTS processing_state CASCADE;
    `);

    console.log('Dropped existing tables');

    await AppDataSource.synchronize();
    console.log('Recreated database schema');

    const { runMigrations } = await import('./migrate');
    await runMigrations();

    const { runSeeds } = await import('./seed');
    await runSeeds();

    console.log('Database reset completed');
    console.log('Processing will start from block 0 on next run');
  } catch (error) {
    console.error('Database reset failed:', error);
    throw error;
  }
}

export async function resetProcessingState(): Promise<void> {
  try {
    console.log('Resetting processing state to start from block 0...');
    
    await AppDataSource.query('DELETE FROM processing_state;');
    
    console.log('Processing state cleared');
    console.log('Next sync will start from block 0');
  } catch (error) {
    console.error('Failed to reset processing state:', error);
    throw error;
  }
}

if (require.main === module) {
  AppDataSource.initialize()
    .then(() => resetDatabase())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}


