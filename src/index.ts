import { checkDatabaseConnection } from './database/index.js';

async function main(): Promise<void> {
  const connected = await checkDatabaseConnection();
  console.log(connected ? 'TechPulse backend ready; Supabase is reachable.' : 'TechPulse backend ready; Supabase is not reachable yet.');
}

main().catch((error: unknown) => {
  console.error('Failed to start TechPulse backend:', error);
  process.exitCode = 1;
});
