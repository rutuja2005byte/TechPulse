import { previewNewsletter, sendNewsletter } from './services/newsletter-service.js';

const usage = [
  'Usage:',
  '  npm run newsletter -- --preview   Generate and validate HTML without storing or sending',
  '  npm run newsletter -- --send      Reserve today and send once through Resend',
  '  npm run newsletter -- --help      Show this help',
].join('\n');

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  if (command === '--help' || command === '-h') {
    console.info(usage);
    return;
  }
  if (command === '--preview') {
    const preview = await previewNewsletter();
    if (!preview.html.startsWith('<!doctype html>') || !preview.html.includes('TECHPULSE')) {
      throw new Error('Generated newsletter HTML failed its document/branding checks.');
    }
    console.info(`[Newsletter] HTML preview is valid: ${preview.storyCount} stories, ${preview.html.length} characters.`);
    console.info(`[Newsletter] Subject: ${preview.subject}`);
    return;
  }
  if (command === '--send') {
    await sendNewsletter();
    return;
  }
  console.error(usage);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('[Newsletter] Operation failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
