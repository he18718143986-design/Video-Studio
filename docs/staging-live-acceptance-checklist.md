# Staging Live Acceptance Checklist

Use this checklist when wiring `staging` for the first time and running the first live acceptance pass.

## 1. Prepare The Staging URL

- Confirm the staging deployment is reachable over `https`.
- Confirm `https://<your-staging-domain>/api/health` returns JSON.
- Confirm the staging database already has the latest migration applied.
- Confirm the staging deployment uses non-production secrets and does not set `E2E_BYPASS_AUTH` or `E2E_BYPASS_GUARD`.

## 2. Prepare Test Accounts

- Create one owner test account for live acceptance.
- Create one non-owner test account for cross-user denial checks.
- Log in once manually with both accounts so auth is initialized.
- Make sure the owner account can access `/settings`.
- Make sure the non-owner account does not already own the owner validation project you plan to create.

Recommended labels:

- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`
- `E2E_NON_OWNER_EMAIL`
- `E2E_NON_OWNER_PASSWORD`

## 3. Staging Secrets Checklist

Add these to GitHub `Environment secrets` for the `staging` environment.

Required application secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

Required provider secrets:

- `GOOGLE_AI_API_KEY` or at least one supported provider key

Required live acceptance secrets:

- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`

Recommended live acceptance secrets:

- `E2E_NON_OWNER_EMAIL`
- `E2E_NON_OWNER_PASSWORD`
- `LIVE_REFERENCE_VIDEO_URL`
- `LIVE_TEST_PROVIDER`
- `LIVE_TEST_API_KEY`

Recommended observability / infra secrets:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `SUPABASE_STORAGE_BUCKET` (only if you don't use the default `videos` bucket)

## 4. Staging Variables Checklist

Add this to GitHub `Environment variables` for the `staging` environment.

- `APP_BASE_URL`
  Example: `https://staging.example.com`

## 5. GitHub Environment Configuration Order

Follow this order in GitHub so validation failures are easier to diagnose.

1. Open repository `Settings`.
2. Open `Environments`.
3. Create environment `staging`.
4. Add environment variable `APP_BASE_URL`.
5. Add required application secrets.
6. Add one provider key secret.
7. Add required live acceptance secrets for the owner account.
8. Add recommended non-owner and reference-video secrets.
9. Save the environment.
10. Re-open the environment once and visually confirm there are no `E2E_BYPASS_*` secrets.

Optional but recommended:

- Add required reviewers for `production`, but keep `staging` lighter so iteration stays fast.
- Restrict deployment branches if your repo already has a release branch model.

## 6. First Manual Validation Before Workflow

Run these checks once before using the GitHub workflow:

```bash
TARGET_ENV=staging \
NEXT_PUBLIC_APP_URL=https://staging.example.com \
PLAYWRIGHT_BASE_URL=https://staging.example.com \
E2E_OWNER_EMAIL=owner@example.com \
E2E_OWNER_PASSWORD='your-password' \
node ./scripts/validate-release-env.mjs
```

```bash
PLAYWRIGHT_BASE_URL=https://staging.example.com \
node ./scripts/check-live-health.mjs
```

Expected result:

- `validate-release-env.mjs` exits `0`
- `check-live-health.mjs` reports `healthy`

## 7. First Live Acceptance Run In GitHub

Open `Actions` -> `Release Governance` -> `Run workflow`, then use:

1. `target_environment`: `staging`
2. `base_url`: leave empty if `APP_BASE_URL` is already correct
3. `run_live_acceptance`: `true`
4. `start_pipeline`: `false` for the first run

Why start with `false`:

- It verifies login, key save, project creation, owner SSE access, non-owner denial, and auth gating without spending provider/render budget on a full pipeline run.

Expected workflow stages:

1. `Validate release environment`
2. `Lint`
3. `Build`
4. `Unit + Integration Tests`
5. `Coverage`
6. `Live health check`
7. `Live acceptance`

Expected live acceptance behavior:

- `/api/health` reports `healthy`
- owner can log in
- owner can save a real API key
- owner can create a real project
- owner can open SSE for that project and receive `200`
- non-owner gets `Project not found`
- non-owner SSE gets `404`
- visiting `/dashboard` while logged out redirects to `/login`

## 8. Optional Second Run With Real Pipeline Start

After the first run is stable, run `Release Governance` again with:

- `target_environment`: `staging`
- `run_live_acceptance`: `true`
- `start_pipeline`: `true`

Use this only when you are ready to spend real provider/runtime budget.

Before running:

- Confirm owner account has the needed provider key
- Confirm `LIVE_REFERENCE_VIDEO_URL` points to a valid reference video
- Confirm staging quotas are sufficient for one test project

## 9. What To Review After The Run

- `coverage-report` artifact exists
- `playwright-report-release` artifact exists
- `Live health check` step is green
- `Live acceptance` step is green
- No release validation error mentions missing `INNGEST_*`, GCS, Supabase, or encryption config

## 10. Common First-Run Failures

- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` missing
  Fix: add both staging secrets and rerun.

- `/api/health` returns `degraded`
  Fix: inspect the `checks` section and correct the failing dependency.

- owner can log in but cannot save key
  Fix: verify `LIVE_TEST_PROVIDER` matches one supported provider and `LIVE_TEST_API_KEY` is valid.

- project creation works but live acceptance stops at non-owner check
  Fix: add `E2E_NON_OWNER_EMAIL` and `E2E_NON_OWNER_PASSWORD`.

- workflow fails before live acceptance starts
  Fix: check `Validate release environment`; it is designed to fail early on missing release-critical config.

## 11. Exit Criteria

You can consider `staging` ready for promotion when:

- `CI` is green on the release commit
- `Release Governance` passes on `staging`
- `check-live-health` reports `healthy`
- at least one live acceptance run passes with `run_live_acceptance=true`
- there are no `E2E_BYPASS_*` secrets in the staging or production environment
