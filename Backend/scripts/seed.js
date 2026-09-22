import { connectDb, disconnectDb } from '../src/config/db.js';
import { runSeed } from './runSeed.js';

async function main() {
  await connectDb();
  const result = await runSeed();
  console.log(`[seed] content types: ${result.contentTypes}, donation schemes: ${result.donationSchemes}`);
  await disconnectDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
