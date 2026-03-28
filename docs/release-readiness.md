# Release Readiness

This repository now has two layers of quality gates:

1. Pull request CI
- Workflow: `CI`
- Required commands: `npm run lint`, `npm run build`, `npm run test`, `npm run test:e2e`

2. Manual release governance
- Workflow: `Release Governance`
- Required checks: release env validation, coverage, optional live health check, optional live Playwright acceptance

## Local Commands

Use these commands before promoting a build:

```bash
npm run validate:release:staging
npm run test:coverage
npm run test:e2e
```

For a deployed staging or production environment:

```bash
PLAYWRIGHT_BASE_URL=https://staging.example.com \
E2E_OWNER_EMAIL=owner@example.com \
E2E_OWNER_PASSWORD=secret \
npm run test:e2e:live
```

Detailed click-by-click setup:

- `docs/staging-live-acceptance-checklist.md`

## GitHub Environment Setup

Create GitHub environments named `staging` and `production`.

Environment variables:
- `APP_BASE_URL`

Environment secrets:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_KEY`
- `GOOGLE_AI_API_KEY` or another supported provider key
- `GCS_BUCKET_NAME`
- `GCS_PROJECT_ID`
- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`

Recommended secrets:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `GOOGLE_APPLICATION_CREDENTIALS`

Live acceptance secrets:
- `E2E_OWNER_EMAIL`
- `E2E_OWNER_PASSWORD`
- `E2E_NON_OWNER_EMAIL`
- `E2E_NON_OWNER_PASSWORD`
- `LIVE_REFERENCE_VIDEO_URL`
- `LIVE_TEST_PROVIDER`
- `LIVE_TEST_API_KEY`

## Branch Protection

Set branch protection on the default branch so that:

- `CI / quality` must pass before merge
- force-push is blocked
- direct pushes are blocked
- stale approvals are dismissed on new commits

`Release Governance` is manual by design, so it should be part of the deploy checklist rather than a merge requirement.

## Release Checklist

1. Confirm `CI` is green on the candidate commit.
2. Run `Release Governance` against `staging` with live acceptance enabled.
3. Review `/api/health` output and Playwright artifacts.
4. If staging passes, run `Release Governance` against `production`.
5. Confirm `E2E_BYPASS_AUTH` and `E2E_BYPASS_GUARD` are not set in production secrets.
6. Record the release version, workflow URL, and rollback target.
