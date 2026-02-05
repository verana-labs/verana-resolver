import { AppDataSource } from './index';

export async function runMigrations(): Promise<void> {
  try {
    console.log('Running database migrations...');

    try {
      await AppDataSource.query(`
        ALTER TABLE trust_evaluations
        ADD COLUMN IF NOT EXISTS is_verifiable_service BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS ecosystems JSONB DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS roles JSONB DEFAULT '[]'::jsonb
      `);
      console.log('Added new columns to trust_evaluations table');
    } catch (_error) {
      console.log('Columns may already exist or migration not needed');
    }

    console.log('Database migrations completed');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

if (require.main === module) {
  AppDataSource.initialize()
    .then(() => runMigrations())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

