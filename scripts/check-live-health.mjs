const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '').trim();

if (!baseUrl) {
  console.error('PLAYWRIGHT_BASE_URL or NEXT_PUBLIC_APP_URL is required for live health checks.');
  process.exit(1);
}

const healthUrl = new URL('/api/health', baseUrl).toString();
const response = await fetch(healthUrl, {
  headers: {
    Accept: 'application/json',
  },
});

let payload = null;
try {
  payload = await response.json();
} catch {
  console.error(`Health endpoint did not return JSON: ${healthUrl}`);
  process.exit(1);
}

console.log(`Health check URL: ${healthUrl}`);
console.log(`HTTP status: ${response.status}`);
console.log(`Reported status: ${payload?.status ?? 'unknown'}`);

if (payload?.checks && typeof payload.checks === 'object') {
  console.log('Checks:');
  for (const [name, check] of Object.entries(payload.checks)) {
    const status = typeof check === 'object' && check && 'status' in check ? check.status : 'unknown';
    console.log(`- ${name}: ${status}`);
  }
}

if (!response.ok || payload?.status !== 'healthy') {
  console.error('Live health validation failed.');
  process.exit(1);
}

console.log('Live health validation passed.');
