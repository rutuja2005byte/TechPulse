import { collectNews } from './services/news-collector.js';

collectNews()
  .then((result) => {
    console.log('News collection complete:', result);
    if (result.failedFeeds > 0 || result.failedArticles > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error('News collection failed before or during source loading:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
