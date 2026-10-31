import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFreeTierGuardedFetch,
  FREE_TIER_STOP_MARKER,
  isFreeTierExhaustion,
  redactSensitiveText,
  requireFreeTierConfirmation,
} from './free-tier-guard.js';

test('quota, rate-limit, and payment-required responses stop without a provider call', async () => {
  assert.equal(isFreeTierExhaustion(429, 'too many requests'), true);
  assert.equal(isFreeTierExhaustion(402, 'payment required'), true);
  assert.equal(isFreeTierExhaustion(403, 'free tier unavailable; payment needed'), true);
  assert.equal(isFreeTierExhaustion(403, 'permission denied for this table'), false);
  assert.equal(isFreeTierExhaustion(500, 'internal server error'), false);
  assert.throws(() => requireFreeTierConfirmation(false, 'Supabase'), new RegExp('free-tier-only account protections'));
  assert.doesNotThrow(() => requireFreeTierConfirmation(true, 'Supabase'));
});

test('Supabase guarded fetch stops on simulated 429 without network access', async () => {
  let requested = false;
  const guardedFetch = createFreeTierGuardedFetch(async () => {
    requested = true;
    return new Response(JSON.stringify({ message: 'rate limit reached' }), { status: 429 });
  });

  await assert.rejects(guardedFetch('https://supabase.invalid/rest/v1/articles'), (error: unknown) =>
    error instanceof Error && error.message.includes(FREE_TIER_STOP_MARKER));
  assert.equal(requested, true);
});

test('Supabase guarded fetch passes ordinary failures through unchanged', async () => {
  const guardedFetch = createFreeTierGuardedFetch(async () => new Response('permission denied', { status: 403 }));
  const response = await guardedFetch('https://supabase.invalid/rest/v1/articles');
  assert.equal(response.status, 403);
});

test('provider error logs redact configured credentials and bearer tokens', () => {
  assert.equal(
    redactSensitiveText('bad key re_secret_example Bearer abc123', 're_secret_example'),
    'bad key [REDACTED] Bearer [REDACTED]',
  );
});
