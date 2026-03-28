const targetEnv = (process.env.TARGET_ENV ?? process.argv[2] ?? 'staging').toLowerCase();
const errors = [];
const warnings = [];

const providerKeys = [
  'GOOGLE_AI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ELEVENLABS_API_KEY',
  'STABILITY_API_KEY',
  'KLING_API_KEY',
  'RUNWAY_API_KEY',
];

function getEnv(name) {
  return process.env[name]?.trim() ?? '';
}

function hasEnv(name) {
  return getEnv(name).length > 0;
}

function requireEnv(name, reason) {
  if (!hasEnv(name)) {
    errors.push(`${name} is required: ${reason}`);
  }
}

function warnIfMissing(name, reason) {
  if (!hasEnv(name)) {
    warnings.push(`${name} is recommended: ${reason}`);
  }
}

function checkEncryptionKey() {
  const key = getEnv('ENCRYPTION_KEY');
  if (!key) {
    errors.push('ENCRYPTION_KEY is required: API keys are encrypted at rest.');
    return;
  }

  if (!/^[a-f0-9]{64}$/i.test(key)) {
    errors.push('ENCRYPTION_KEY must be a 64-character hex string.');
  }
}

function checkAppUrl() {
  const appUrl = getEnv('NEXT_PUBLIC_APP_URL');
  if (!appUrl) return;

  try {
    const parsed = new URL(appUrl);
    if (targetEnv === 'production' && parsed.protocol !== 'https:') {
      errors.push('NEXT_PUBLIC_APP_URL must use https in production.');
    }
  } catch {
    errors.push('NEXT_PUBLIC_APP_URL must be a valid absolute URL.');
  }
}

function checkProviders() {
  const configured = providerKeys.filter(hasEnv);
  if (configured.length === 0) {
    errors.push('At least one AI provider key must be configured for release validation.');
  }
}

function checkRedisPair() {
  const urlSet = hasEnv('UPSTASH_REDIS_REST_URL');
  const tokenSet = hasEnv('UPSTASH_REDIS_REST_TOKEN');

  if (urlSet !== tokenSet) {
    errors.push('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured together.');
  }

  if (!urlSet && !tokenSet) {
    warnings.push('Redis is not configured. Queueing and caching features may be degraded.');
  }
}

function checkLangfuse() {
  const publicKeySet = hasEnv('LANGFUSE_PUBLIC_KEY');
  const secretKeySet = hasEnv('LANGFUSE_SECRET_KEY');

  if (publicKeySet !== secretKeySet) {
    errors.push('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be configured together.');
  }

  if (!publicKeySet && !secretKeySet) {
    warnings.push('Langfuse is not configured. Observability and cost tracing will be limited.');
  }
}

function checkE2EBypass() {
  const bypassEnabled = getEnv('E2E_BYPASS_AUTH') === '1';
  const bypassGuard = getEnv('E2E_BYPASS_GUARD');

  if (targetEnv === 'production' && (bypassEnabled || bypassGuard)) {
    errors.push('E2E auth bypass variables must not be set in production.');
    return;
  }

  if (targetEnv !== 'production' && bypassEnabled) {
    warnings.push('E2E_BYPASS_AUTH is enabled. Keep it scoped to ephemeral validation only.');
  }
}

function checkLiveAcceptanceInputs() {
  if (getEnv('REQUIRE_LIVE_ACCEPTANCE') !== '1' && getEnv('PLAYWRIGHT_LIVE') !== '1') {
    return;
  }

  requireEnv('PLAYWRIGHT_BASE_URL', 'Live acceptance needs the deployed app URL.');
  requireEnv('E2E_OWNER_EMAIL', 'Live acceptance login uses an owner test account.');
  requireEnv('E2E_OWNER_PASSWORD', 'Live acceptance login uses an owner test account.');
  warnIfMissing('E2E_NON_OWNER_EMAIL', 'Needed to verify cross-user access denial in live acceptance.');
  warnIfMissing('E2E_NON_OWNER_PASSWORD', 'Needed to verify cross-user access denial in live acceptance.');
  warnIfMissing('LIVE_REFERENCE_VIDEO_URL', 'Needed for real project-creation acceptance.');
}

requireEnv('NEXT_PUBLIC_SUPABASE_URL', 'Supabase browser client requires it.');
requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'Supabase browser client requires it.');
requireEnv('SUPABASE_SERVICE_ROLE_KEY', 'Server-side routers and admin actions require it.');
requireEnv('NEXT_PUBLIC_APP_URL', 'Generated links and release checks rely on it.');
requireEnv('INNGEST_EVENT_KEY', 'Pipeline orchestration requires Inngest.');
requireEnv('INNGEST_SIGNING_KEY', 'Pipeline orchestration requires Inngest.');

checkEncryptionKey();
checkAppUrl();
checkProviders();
checkRedisPair();
checkLangfuse();
checkE2EBypass();
checkLiveAcceptanceInputs();
warnIfMissing('SUPABASE_STORAGE_BUCKET', 'Defaults to "videos" when omitted. Set it only if you use a custom bucket.');

const configuredProviders = providerKeys.filter(hasEnv);

console.log(`Release environment validation for: ${targetEnv}`);
console.log(`Configured AI providers: ${configuredProviders.length > 0 ? configuredProviders.join(', ') : 'none'}`);

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('\nErrors:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('\nRelease environment validation passed.');
