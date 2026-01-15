import { AppDataSource } from './index';

export async function runSeeds(): Promise<void> {
  try {
    console.log('Seeding database with development data...');


    console.log('Database seeding completed');
  } catch (error) {
    console.error('Seeding failed:', error);
    throw error;
  }
}

if (require.main === module) {
  AppDataSource.initialize()
    .then(() => runSeeds())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}


