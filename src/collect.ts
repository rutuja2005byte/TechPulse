import { collectNews } from './services/news-collector.js';

collectNews()
  .then((result) => {
    console.log('News collection complete:', result);
    if (result.failedFeeds > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error('News collection failed:', error);
    process.exitCode = 1;
  });
