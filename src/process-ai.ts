import { processUnprocessedArticles } from './services/story-processor.js';

console.info('Starting TechPulse Phase 3 AI processing.');

processUnprocessedArticles()
  .then((result) => {
    console.info('AI processing complete:', result);
    if (result.failedStories > 0 || result.failedDatabaseOperations > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error('AI processing failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
