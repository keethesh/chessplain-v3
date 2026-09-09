import dotenv from 'dotenv';
dotenv.config();

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Copy .env.example and fill it in — there is no default, on purpose: a fallback here would silently point this process at production.`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  llmApiBase: process.env.LLM_API_BASE || 'https://crof.ai/v1',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'deepseek-v4-flash-0731',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || '',
  stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || '',
  posthogKey: process.env.POSTHOG_KEY || '',
  posthogHost: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
  enginePath: process.env.ENGINE_PATH || (process.platform === 'win32' ? 'stockfish' : '/usr/local/bin/stockfish18_clang'),
  syzygyPath: process.env.SYZYGY_PATH || '/var/chess/syzygy',
  webOrigin: process.env.WEB_ORIGIN || 'https://getchessplain.com',
  disableQuota: process.env.DISABLE_QUOTA === 'true',
  enginePoolSize: positiveInteger('ENGINE_POOL_SIZE', 4),
  engineHashMb: positiveInteger('ENGINE_HASH_MB', 512),
  engineThreads: positiveInteger('ENGINE_THREADS', 1),
  staleLeaseMinutes: positiveInteger('STALE_LEASE_MINUTES', 15),
  // Trust forwarded IPs only from an explicitly configured reverse proxy.
  trustProxy: process.env.TRUST_PROXY || false,
};
