import { expect, test, type Page } from '@playwright/test';

type Provider = 'google' | 'openai' | 'anthropic' | 'elevenlabs' | 'stability' | 'kling' | 'runway';

const PROVIDER_ORDER: Provider[] = [
  'google',
  'openai',
  'anthropic',
  'elevenlabs',
  'stability',
  'kling',
  'runway',
];

const UNVERIFIED_PROVIDERS = new Set<Provider>(['stability', 'kling', 'runway']);

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for live acceptance tests.`);
  }
  return value;
}

function getOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
}

function providerIndex(provider: Provider) {
  return PROVIDER_ORDER.indexOf(provider);
}

test.describe.serial('@live 真环境验收', () => {
  test.skip(process.env.PLAYWRIGHT_LIVE !== '1', 'Live acceptance only runs when PLAYWRIGHT_LIVE=1.');

  let createdProjectId: string | null = null;

  test('@live 健康检查返回 healthy', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.checks).toBeTruthy();
  });

  test('@live owner 可以登录并保存真实 API key', async ({ page }) => {
    const ownerEmail = getRequiredEnv('E2E_OWNER_EMAIL');
    const ownerPassword = getRequiredEnv('E2E_OWNER_PASSWORD');
    const providerName = getOptionalEnv('LIVE_TEST_PROVIDER');
    const apiKey = getOptionalEnv('LIVE_TEST_API_KEY');

    test.skip(!providerName || !apiKey, 'LIVE_TEST_PROVIDER and LIVE_TEST_API_KEY are required for key validation.');

    const provider = providerName as Provider;
    if (!PROVIDER_ORDER.includes(provider)) {
      throw new Error(`Unsupported LIVE_TEST_PROVIDER: ${providerName}`);
    }

    await login(page, ownerEmail, ownerPassword);
    await openSettings(page);

    const idx = providerIndex(provider);
    const newKeyInput = page.locator('input[placeholder="Paste API key..."], input[placeholder="Enter new key to replace..."]').nth(idx);
    const saveButton = page.getByRole('button', { name: 'Save & Test' }).nth(idx);

    await newKeyInput.fill(apiKey);
    await saveButton.click();

    if (UNVERIFIED_PROVIDERS.has(provider)) {
      await expect(page.getByText(/unverified/i)).toBeVisible();
    } else {
      await expect(page.getByText(/Saved successfully/i)).toBeVisible();
    }

    await expect(page.getByText('Configured', { exact: true }).first()).toBeVisible();
  });

  test('@live owner 可以创建项目并验证 owner SSE 可访问', async ({ page }) => {
    const ownerEmail = getRequiredEnv('E2E_OWNER_EMAIL');
    const ownerPassword = getRequiredEnv('E2E_OWNER_PASSWORD');
    const referenceVideoUrl = getOptionalEnv('LIVE_REFERENCE_VIDEO_URL');
    const shouldStartPipeline = getOptionalEnv('LIVE_START_PIPELINE') === '1';

    test.skip(!referenceVideoUrl, 'LIVE_REFERENCE_VIDEO_URL is required for real project creation.');

    await login(page, ownerEmail, ownerPassword);
    await page.goto('/projects/new');

    await page.getByLabel('Video URL').fill(referenceVideoUrl!);
    await page.getByRole('button', { name: /^Next$/ }).click();
    await page.getByLabel('Topic').fill(`Release validation topic ${Date.now()}`);
    await page.getByLabel('Project Title (optional)').fill(`Release Validation ${Date.now()}`);
    await page.getByRole('button', { name: /^Next$/ }).click();
    await page.getByRole('button', { name: 'Create Project' }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
    createdProjectId = page.url().split('/').pop() ?? null;
    expect(createdProjectId).toBeTruthy();

    const ownerSseStatus = await page.evaluate(async (projectId) => {
      const controller = new AbortController();
      const response = await fetch(`/api/sse/${projectId}`, {
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      controller.abort();
      return response.status;
    }, createdProjectId);

    expect(ownerSseStatus).toBe(200);

    if (shouldStartPipeline) {
      await expect(page.getByRole('button', { name: 'Start Pipeline' })).toBeVisible();
      await page.getByRole('button', { name: 'Start Pipeline' }).click();
      await expect(page.getByRole('button', { name: 'Start Pipeline' })).toHaveCount(0);
    }
  });

  test('@live non-owner 无法访问 owner 项目和 SSE', async ({ page }) => {
    const nonOwnerEmail = getOptionalEnv('E2E_NON_OWNER_EMAIL');
    const nonOwnerPassword = getOptionalEnv('E2E_NON_OWNER_PASSWORD');

    test.skip(!createdProjectId, 'A project must be created before non-owner validation can run.');
    test.skip(!nonOwnerEmail || !nonOwnerPassword, 'Non-owner credentials are required for cross-user validation.');

    await login(page, nonOwnerEmail!, nonOwnerPassword!);
    await page.goto(`/projects/${createdProjectId}`);

    await expect(page.getByText('Project not found')).toBeVisible();

    const sseStatus = await page.evaluate(async (projectId) => {
      const response = await fetch(`/api/sse/${projectId}`, {
        headers: { Accept: 'text/event-stream' },
      });
      return response.status;
    }, createdProjectId);

    expect(sseStatus).toBe(404);
  });

  test('@live 页面级鉴权 bypass 在真环境不可用', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });
});
