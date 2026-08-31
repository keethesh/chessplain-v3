import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  supabaseUrl: process.env.SUPABASE_URL || 'https://jgtxprfulkbtzkcvinph.supabase.co',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpndHhwcmZ1bGtidHprY3ZpbnBoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyODk0ODIsImV4cCI6MjA3Njg2NTQ4Mn0.E8eXXrpiAiA_T0wz5yh_u6m2USL7QMs7IfSDc80bIKI',
  llmApiBase: process.env.LLM_API_BASE || 'https://api.crof.ai/v1',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'deepseek-v4-flash-0731',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY || 'price_1SOs7yFtgmZSE6kx0wJ3wY3u',
  stripePriceYearly: process.env.STRIPE_PRICE_YEARLY || 'price_1SOs7yFtgmZSE6kxI9RoSTXR',
  posthogKey: process.env.POSTHOG_KEY || 'phc_UKy5oAuRvZ0zofoUDe1hWPGchLU1IkcpjOP2P3aCUa5',
  posthogHost: process.env.POSTHOG_HOST || 'https://eu.i.posthog.com',
  enginePath: process.env.ENGINE_PATH || (process.platform === 'win32' ? 'stockfish' : '/usr/local/bin/stockfish18_clang'),
  syzygyPath: process.env.SYZYGY_PATH || '/var/chess/syzygy',
  webOrigin: process.env.WEB_ORIGIN || 'https://chessplain.com',
  enginePoolSize: parseInt(process.env.ENGINE_POOL_SIZE || '4', 10),
};
