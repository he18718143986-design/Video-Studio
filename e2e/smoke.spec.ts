import { expect, test, type Page, type Request, type Route } from '@playwright/test';

type Provider = 'google' | 'openai' | 'anthropic' | 'elevenlabs' | 'stability' | 'kling' | 'runway';

interface MockUser {
  id: string;
  email: string;
  aud: 'authenticated';
  role: 'authenticated';
}

interface MockProject {
  id: string;
  user_id: string;
  title: string;
  new_topic: string;
  status: string;
  current_step: number;
  total_cost_usd: number;
  quality: string;
  target_duration_sec: number;
  language: string;
  created_at: string;
  reference_video_url: string | null;
  final_video_url: string | null;
  script: null;
  storyboard: null;
  style_dna: null;
  error_message: string | null;
}

interface MockState {
  user: MockUser;
  savedKeys: Set<Provider>;
  projects: Map<string, MockProject>;
  nextProjectSeq: number;
}

declare global {
  interface Window {
    __e2eEmitSse?: (url: string, payload: unknown) => void;
  }
}

const PROVIDERS: Provider[] = [
  'google',
  'openai',
  'anthropic',
  'elevenlabs',
  'stability',
  'kling',
  'runway',
];

function createState(overrides?: Partial<MockState>): MockState {
  return {
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'owner@example.com',
      aud: 'authenticated',
      role: 'authenticated',
    },
    savedKeys: new Set<Provider>(),
    projects: new Map<string, MockProject>(),
    nextProjectSeq: 1,
    ...overrides,
  };
}

function trpcSuccess<T>(data: T) {
  return { result: { data: { json: data } } };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function unwrapInput(value: unknown): Record<string, unknown> {
  const inputRecord = asRecord(value);
  const maybeSerialized = inputRecord['json'];
  if (maybeSerialized && typeof maybeSerialized === 'object' && !Array.isArray(maybeSerialized)) {
    return maybeSerialized as Record<string, unknown>;
  }
  return inputRecord;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && PROVIDERS.includes(value as Provider);
}

function providerAvailability(keys: Set<Provider>): Record<Provider, boolean> {
  return {
    google: keys.has('google'),
    openai: keys.has('openai'),
    anthropic: keys.has('anthropic'),
    elevenlabs: keys.has('elevenlabs'),
    stability: keys.has('stability'),
    kling: keys.has('kling'),
    runway: keys.has('runway'),
  };
}

function buildSession(user: MockUser) {
  return {
    access_token: 'e2e-access-token',
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

function parseTrpcInputs(request: Request, url: URL, pathCount: number): unknown[] {
  const inputRaw = request.method() === 'GET' ? url.searchParams.get('input') : request.postData();
  if (!inputRaw) {
    return Array.from({ length: pathCount }, () => null);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(inputRaw);
  } catch {
    return Array.from({ length: pathCount }, () => null);
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    return Array.from({ length: pathCount }, (_unused, index) => record[String(index)] ?? null);
  }

  return [parsed];
}

function readEqParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  if (!value || !value.startsWith('eq.')) return null;
  return decodeURIComponent(value.slice(3));
}

function shouldReturnObject(request: Request): boolean {
  const accept = request.headers()['accept'] ?? '';
  return accept.includes('application/vnd.pgrst.object+json');
}

function projectIdForSeq(seq: number): string {
  return `11111111-1111-4111-8111-${String(seq).padStart(12, '0')}`;
}

async function installAuthMocks(page: Page, state: MockState) {
  await page.route('**/auth/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname.endsWith('/token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildSession(state.user)),
      });
      return;
    }

    if (url.pathname.endsWith('/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.user),
      });
      return;
    }

    if (url.pathname.endsWith('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

async function installRestMocks(page: Page, state: MockState) {
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (!url.pathname.endsWith('/projects')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (request.method() === 'POST') {
      const payload = asRecord(request.postDataJSON());
      const id = projectIdForSeq(state.nextProjectSeq);
      state.nextProjectSeq += 1;

      const createdAt = new Date().toISOString();
      const project: MockProject = {
        id,
        user_id: asString(payload['user_id'], state.user.id),
        title: asString(payload['title'], 'Untitled'),
        new_topic: asString(payload['new_topic'], ''),
        status: asString(payload['status'], 'pending'),
        current_step: Number(payload['current_step'] ?? 0),
        total_cost_usd: Number(payload['total_cost_usd'] ?? 0),
        quality: asString(payload['quality'], 'fast'),
        target_duration_sec: Number(payload['target_duration_sec'] ?? 120),
        language: asString(payload['language'], 'auto'),
        created_at: createdAt,
        reference_video_url: asString(payload['reference_video_url']) || null,
        final_video_url: null,
        script: null,
        storyboard: null,
        style_dna: null,
        error_message: null,
      };

      state.projects.set(project.id, project);
      const body = shouldReturnObject(request) ? JSON.stringify(project) : JSON.stringify([project]);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body,
      });
      return;
    }

    if (request.method() === 'GET') {
      const idFilter = readEqParam(url, 'id');
      const ownerFilter = readEqParam(url, 'user_id');

      if (idFilter) {
        const project = state.projects.get(idFilter);
        const isOwner = !ownerFilter || project?.user_id === ownerFilter;

        if (!project || !isOwner) {
          await route.fulfill({
            status: 406,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'PGRST116',
              message: 'The result contains 0 rows',
            }),
          });
          return;
        }

        const body = shouldReturnObject(request) ? JSON.stringify(project) : JSON.stringify([project]);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body,
        });
        return;
      }

      const items = [...state.projects.values()]
        .filter((item) => !ownerFilter || item.user_id === ownerFilter)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(items),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

function handleProcedure(path: string, input: unknown, state: MockState): unknown {
  switch (path) {
    case 'user.getApiKeys':
      return [...state.savedKeys].map((provider, index) => ({
        id: `key-${provider}-${index}`,
        provider,
        maskedKey: `${provider.slice(0, 4)}****key`,
        createdAt: new Date().toISOString(),
      }));
    case 'user.availableProviders':
      return providerAvailability(state.savedKeys);
    case 'user.testApiKey': {
      const record = unwrapInput(input);
      const provider = record['provider'];
      if (provider === 'stability' || provider === 'kling' || provider === 'runway') {
        return {
          valid: true,
          verified: false,
          message: `${provider} key saved as unverified (mock).`,
        };
      }
      return {
        valid: true,
        verified: true,
        message: `${asString(provider, 'provider')} API key is valid.`,
      };
    }
    case 'user.setApiKey': {
      const provider = unwrapInput(input)['provider'];
      if (isProvider(provider)) {
        state.savedKeys.add(provider);
      }
      return { success: true };
    }
    case 'user.deleteApiKey': {
      const provider = unwrapInput(input)['provider'];
      if (isProvider(provider)) {
        state.savedKeys.delete(provider);
      }
      return { success: true };
    }
    case 'project.start': {
      const id = asString(unwrapInput(input)['id']);
      const project = state.projects.get(id);
      if (project) {
        project.status = 'step_1';
        project.current_step = 1;
      }
      return { success: true };
    }
    case 'project.retry':
    case 'project.refine':
    case 'scene.updateVoiceover':
      return { success: true };
    default:
      return {};
  }
}

async function installTrpcMocks(page: Page, state: MockState) {
  await page.route('**/api/trpc/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const rawPath = url.pathname.replace(/^\/api\/trpc\//, '');
    const paths = rawPath.split(',').filter(Boolean);
    const inputs = parseTrpcInputs(request, url, paths.length);
    const responses = paths.map((path, index) => trpcSuccess(handleProcedure(path, inputs[index], state)));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responses),
    });
  });
}

async function installFakeEventSource(page: Page) {
  await page.addInitScript(() => {
    const channels = new Map<string, Set<{ onmessage: ((event: { data: string }) => void) | null }>>();

    class MockEventSource {
      url: string;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      readyState = 1;

      constructor(url: string | URL) {
        this.url = String(url);
        const listeners = channels.get(this.url) ?? new Set();
        listeners.add(this);
        channels.set(this.url, listeners);
      }

      close() {
        this.readyState = 2;
        const listeners = channels.get(this.url);
        listeners?.delete(this);
      }
    }

    Object.defineProperty(window, 'EventSource', {
      value: MockEventSource,
      writable: true,
      configurable: true,
    });

    window.__e2eEmitSse = (url: string, payload: unknown) => {
      const listeners = channels.get(url);
      if (!listeners) return;
      const encoded = JSON.stringify(payload);
      for (const listener of listeners) {
        listener.onmessage?.({ data: encoded });
      }
    };
  });
}

async function installAppMocks(page: Page, state: MockState) {
  await installAuthMocks(page, state);
  await installRestMocks(page, state);
  await installTrpcMocks(page, state);
}

test('@smoke 登录后可保存未验证 Key 且看到状态', async ({ page }) => {
  const state = createState();
  await installAppMocks(page, state);

  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  const stabilityInput = page.getByPlaceholder('Paste API key...').nth(4);
  await stabilityInput.fill('stability-test-key');
  await page.getByRole('button', { name: 'Save & Test' }).nth(4).click();

  await expect(page.getByText(/stability key saved as unverified/i)).toBeVisible();
  await expect(page.getByText('Configured', { exact: true }).first()).toBeVisible();
});

test('@smoke 创建项目并启动流程后可收到进度更新', async ({ page }) => {
  const state = createState();
  await installFakeEventSource(page);
  await installAppMocks(page, state);

  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@example.com');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/projects/new');
  await page.getByLabel('Video URL').fill('https://example.com/reference.mp4');
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.getByLabel('Topic').fill('How do kidneys work?');
  await page.getByRole('button', { name: /^Next$/ }).click();
  await page.getByRole('button', { name: 'Create Project' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByRole('button', { name: 'Start Pipeline' })).toBeVisible();
  await page.getByRole('button', { name: 'Start Pipeline' }).click();

  const projectId = page.url().split('/').pop();
  if (!projectId) {
    throw new Error('Project id was not found in URL');
  }

  await page.evaluate(({ id }) => {
    const emit = window.__e2eEmitSse;
    if (!emit) throw new Error('SSE emitter is not available');
    const channel = `/api/sse/${id}`;
    emit(channel, {
      type: 'project_status',
      data: {
        status: 'step_2',
        currentStep: 2,
        totalCostUsd: 0.4321,
        finalVideoUrl: null,
      },
    });
    emit(channel, {
      type: 'pipeline_event',
      data: {
        projectId: id,
        stepNumber: 2,
        stepName: 'step_2a_capability_assessment',
        status: 'started',
      },
    });
  }, { id: projectId });

  await expect(page.getByText(/\$0\.4321/)).toBeVisible();
});

test('@smoke 非 owner 访问项目和 SSE 会被拒绝', async ({ page }) => {
  const state = createState({
    user: {
      id: '00000000-0000-4000-8000-000000000002',
      email: 'other-user@example.com',
      aud: 'authenticated',
      role: 'authenticated',
    },
  });
  await installAppMocks(page, state);

  let sseDeniedCount = 0;
  await page.route('**/api/sse/**', async (route: Route) => {
    sseDeniedCount += 1;
    await route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: 'Project not found',
    });
  });

  await page.goto('/projects/99999999-9999-4999-8999-999999999999');

  await expect(page.getByText('Project not found')).toBeVisible();
  await expect.poll(() => sseDeniedCount).toBeGreaterThan(0);
});
