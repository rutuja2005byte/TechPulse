/**
 * Fail closed when a provider signals that free execution cannot continue.
 * This is a usage guard, not a billing control: provider account settings remain
 * authoritative and must be configured to disallow paid usage.
 */
export const FREE_TIER_STOP_MARKER = '[TECHPULSE_FREE_TIER_STOP]';

const paymentOrQuotaText = /quota|rate.?limit|resource_exhausted|payment.?required|billing|paid tier|free tier unavailable|insufficient.?quota|usage.?limit|over.?quota|trial expired|project.{0,20}paused/i;

export function isFreeTierExhaustion(status: number | undefined, message: string): boolean {
  return status === 402 || status === 429 || paymentOrQuotaText.test(message);
}

export function freeTierStopMessage(provider: string, status: number | undefined, message: string): string {
  const reason = status === 429 ? 'quota or rate limit reached'
    : status === 402 ? 'payment required'
      : /trial expired/i.test(message) ? 'free trial expired'
        : /paid tier|free tier unavailable/i.test(message) ? 'free tier unavailable'
          : 'provider reported a quota, billing, or payment restriction';
  return `${FREE_TIER_STOP_MARKER} ${provider}: ${reason}${status ? ` (HTTP ${status})` : ''}. Pipeline stopped; no paid fallback will be attempted.`;
}

export function stopForFreeTierExhaustion(provider: string, status: number | undefined, message: string): never {
  const detail = freeTierStopMessage(provider, status, message);
  console.error(detail);
  throw new Error(detail);
}

export function requireFreeTierConfirmation(confirmed: boolean, provider: string): void {
  if (confirmed) return;
  const message = `${FREE_TIER_STOP_MARKER} ${provider}: free-tier-only account protections have not been confirmed. Set TECHPULSE_FREE_TIER_CONFIRMED=true only after disabling paid overages and verifying the provider is on its no-cost tier.`;
  console.error(message);
  throw new Error(message);
}

export function isFreeTierStopError(error: unknown): boolean {
  if (error instanceof Error && error.message.includes(FREE_TIER_STOP_MARKER)) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown; details?: unknown };
  const status = Number(candidate.status ?? candidate.code);
  const message = [candidate.message, candidate.details].filter((item): item is string => typeof item === 'string').join(' ');
  return isFreeTierExhaustion(Number.isFinite(status) ? status : undefined, message);
}

export function redactSensitiveText(value: string, ...secrets: Array<string | undefined>): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:re_[A-Za-z0-9_-]{10,}|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED]');
}

export function createFreeTierGuardedFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await baseFetch(input, init);
    if (response.status >= 400 && response.status < 500) {
      const body = await response.clone().text().catch(() => '');
      if (isFreeTierExhaustion(response.status, body)) stopForFreeTierExhaustion('Supabase', response.status, body);
    }
    return response;
  };
}
