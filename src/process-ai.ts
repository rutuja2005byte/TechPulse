import { processUnprocessedArticles, reprocessExistingStory } from './services/story-processor.js';

const usage = [
  'Usage:',
  '  npm run process:ai                         Process unprocessed articles in batches',
  '  npm run process:ai -- <story-id>           Safely reprocess one existing story',
  '  npm run process:ai -- --reprocess-story <story-id>',
  '  npm run process:ai -- --help               Show this help',
].join('\n');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    console.info(usage);
    return;
  }

  let storyId: string | undefined;
  if (args.length === 1) storyId = args[0];
  else if (args.length === 2 && args[0] === '--reprocess-story') storyId = args[1];
  else if (args.length > 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  if (storyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storyId)) {
    console.error(`Invalid story ID: expected a UUID.\n${usage}`);
    process.exitCode = 1;
    return;
  }

  console.info('Starting TechPulse Phase 3 AI processing.');
  const result = storyId
    ? await reprocessExistingStory(storyId)
    : await processUnprocessedArticles();
  console.info('AI processing complete:', result);
  if (result.failedStories > 0 || result.failedDatabaseOperations > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
    console.error('AI processing failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
