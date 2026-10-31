import { previewNewsletter, sendNewsletter, sendNewsletterTest } from './services/newsletter-service.js';

const usage = [
  'Usage:',
  '  npm run newsletter -- --preview   Generate and validate HTML without storing or sending',
  '  npm run newsletter -- --send      Reserve today and send once through Resend',
  '  npm run newsletter -- --retry     Retry today\'s definite failed, unsent record',
  '  npm run newsletter -- --test-send <sent-newsletter-id>  Send its stored HTML to one configured Gmail',
  '  npm run newsletter -- --help      Show this help',
].join('\n');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [command] = args;
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
    await sendNewsletter(false);
    return;
  }
  if (command === '--retry') {
    await sendNewsletter(true);
    return;
  }
  if (command === '--test-send' && args.length === 2) {
    await sendNewsletterTest(args[1]);
    return;
  }
  console.error(usage);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error('[Newsletter] Operation failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
