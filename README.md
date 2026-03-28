# SciVid AI — AI Science Video Generator

An AI-powered web application that generates science animation videos by analyzing a reference video's style and applying it to a new topic through a 13-step hybrid pipeline.

## Features

- **Style DNA Extraction**: Analyzes reference video for visual style, narrative structure, and audio characteristics
- **13-Step AI Pipeline**: Safety check, research, scripting, storyboard, visual production, TTS, and rendering
- **Multi-Provider Support**: Google (Gemini/Veo), OpenAI, Anthropic, ElevenLabs, Stability, Kling, Runway
- **Real-time Progress**: Server-Sent Events for live pipeline tracking
- **Cost Tracking**: Per-step cost monitoring with Langfuse integration
- **Multi-language**: English and Chinese support with auto-detection
- **Production Ready**: Rate limiting, user quotas, Docker deployment, health checks

## Prerequisites

- Node.js 18+
- FFmpeg (for video rendering)
- Supabase account (database + auth)
- At least one AI provider API key (Google AI recommended)

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd <repository-root>   # e.g. Video-Studio or video-studio if that is the repo root
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

- **Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Required**: `ENCRYPTION_KEY` (generate with `openssl rand -hex 32`)
- **Required**: At least one AI provider key (e.g., `GOOGLE_AI_API_KEY`)
- **Recommended**: `SUPABASE_STORAGE_BUCKET` (defaults to `videos`)

### 2.1 Before Uploading To GitHub

- Keep secrets only in `.env` (this file is ignored by git).
- Commit only `.env.example` with placeholders.
- If any real key was ever exposed, rotate it before publishing:
  - Supabase anon/service-role keys
  - AI provider keys
  - GCP service account key JSON

### 3. Set up Supabase

```bash
# Install Supabase CLI (npm global install is not supported — use Homebrew on macOS)
brew install supabase/tap/supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

Or manually run SQL files under `supabase/migrations/` (e.g. `001_initial.sql`, and any later files) in the Supabase SQL editor.

### 4. Set up Supabase Storage Bucket

Ensure migration `002_storage_uploads.sql` is applied (via `supabase db push`) so bucket `videos` and its policies exist.

### 5. Start Inngest dev server

```bash
npx inngest-cli@latest dev
```

### 6. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality Gates

Local verification:

```bash
npm run lint
npm run test
npm run build
npm run check:secrets
npm run test:e2e
```

Release governance:

```bash
npm run validate:release:staging
npm run test:coverage
PLAYWRIGHT_BASE_URL=https://staging.example.com npm run test:e2e:live
```

The repository also includes:
- `CI` for pull request gates
- `Release Governance` for staging / production readiness
- `docs/release-readiness.md` for branch protection and environment setup

## Architecture

### Pipeline Steps

| Step | Name | Capability | Description |
|------|------|-----------|-------------|
| 1 | Safety Pre-check | fast_reasoning | Content safety classification |
| 2a | Capability Assessment | video_understanding | Model self-assessment before extraction |
| 2b | Style DNA Extraction | video_understanding | Extract visual, narrative, audio style |
| 3 | Deep Research | fast_reasoning | Scientific fact-checking with Google Search |
| 4 | Narrative Map | text_reasoning | Scene-level production contracts |
| 5 | Script Generation | text_reasoning | Expand contracts into voiceover text |
| 6 | QA Audit | fast_reasoning | Quality + safety re-check |
| 7 | Storyboard | text_reasoning | Visual prompts + camera directions |
| 8 | Reference Sheet | image_generation | Style bible reference image |
| 9 | Keyframes | image_generation | Per-scene keyframe images |
| 10 | Video Generation | video_generation | I2V with T2V fallback |
| 11 | TTS | tts | Per-scene voice generation |
| 12 | Rendering | FFmpeg | Audio-driven alignment + subtitle burn |
| 13 | Refinement | text_reasoning | On-demand script/visual updates |

### Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, shadcn/ui, Zustand, Video.js
- **Backend**: tRPC v11, Inngest, BullMQ
- **Database**: PostgreSQL (Supabase)
- **Storage**: Supabase Storage
- **AI**: Gemini, GPT-4o, Claude, ElevenLabs, Veo, Kling, Runway

### Project Structure

```
app/                    # Next.js App Router pages
components/             # React components
server/                 # tRPC routers
services/               # Pipeline service implementations
  adapters/             # AI provider adapters
inngest/                # Inngest workflow functions
lib/                    # Shared utilities and types
store/                  # Zustand state management
i18n/                   # Internationalization files
supabase/               # Database migrations
```

---

## Production Deployment (Multi-User)

Below is a complete guide to deploy SciVid AI for many users.

### Deployment Architecture

```
Users (Browser)
    │
    ▼
┌──────────────┐     ┌───────────────┐
│   Vercel /   │────▶│   Supabase    │
│   Docker     │     │  (DB + Auth)  │
│  (Next.js)   │     └───────────────┘
└──────┬───────┘
       │
       ├────▶ Supabase Storage (assets)
       ├────▶ Inngest Cloud (workflow)
       ├────▶ Google AI / OpenAI / Anthropic (AI)
       └────▶ Langfuse (observability)
```

### Option A: Deploy to Vercel (Simplest)

This repo includes `vercel.json` (Next.js framework, `npm ci`, default region `iad1`). The production build uses `npm run build` from `package.json` (`next build --webpack`).

**1. Import the project**

- Push this app to GitHub, then in [Vercel](https://vercel.com) choose **Add New → Project** and import the repository.
- If the Next.js app lives in a subfolder of the repo, set **Root Directory** to that folder (e.g. `video-studio`).

**2. Environment variables**

In **Settings → Environment Variables**, add every key from `.env.example` for **Production** (and Preview if you want preview deployments to work).

Important for production:

- **`NEXT_PUBLIC_APP_URL`**: your live URL, e.g. `https://your-project.vercel.app` or your custom domain.
- **`SUPABASE_SERVICE_ROLE_KEY`**, **`NEXT_PUBLIC_*` Supabase keys**: from the Supabase project dashboard (never commit these to git).
- **`ENCRYPTION_KEY`**: generate with `openssl rand -hex 32`.
- **`SUPABASE_STORAGE_BUCKET`** (optional): set only if you use a bucket name other than `videos`.

**3. Supabase Auth**

In Supabase **Authentication → URL Configuration**:

- Set **Site URL** to the same URL as `NEXT_PUBLIC_APP_URL`.
- Add **Redirect URLs**: your production URL and `https://your-project.vercel.app/**` (and preview URLs if needed).

**4. Inngest**

In [Inngest Cloud](https://app.inngest.com), point the app’s serve URL to:

`https://<your-vercel-domain>/api/inngest`

Use the **`INNGEST_SIGNING_KEY`** (and related keys) from the Inngest dashboard in Vercel env.

**5. CLI deploy (optional)**

```bash
npm i -g vercel
vercel --prod
```

**Pros**: Zero-config scaling, global CDN, automatic HTTPS  
**Cons**: Serverless timeouts (Hobby is very short; **Pro** allows up to **60s** per function—this repo sets `maxDuration` on `/api/inngest` and `/api/sse`). Long **FFmpeg** renders may still need Docker or a worker outside Vercel—see Option B.

### Option B: Deploy with Docker (Full Control)

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f app
```

This starts:
- **app** (port 3000): Next.js application
- **inngest** (port 8288): Workflow engine
- **redis** (port 6379): Cache and queues

For cloud VPS deployment (AWS EC2, DigitalOcean, Hetzner):

```bash
# On your server
git clone <repo-url>
cd ai-science-video-generator
cp .env.example .env
# Edit .env with production values

docker compose up -d --build
```

### Option C: Railway / Fly.io

**Railway:**
1. Connect GitHub repository at [railway.app](https://railway.app)
2. Railway auto-detects the Dockerfile
3. Set environment variables in the dashboard
4. Deploy

**Fly.io:**
```bash
fly launch
fly secrets set GOOGLE_AI_API_KEY=xxx NEXT_PUBLIC_SUPABASE_URL=xxx ...
fly deploy
```

### API Key Management: Two Modes

#### Mode 1: Users bring their own keys (BYOK)
- Each user enters API keys in `/settings`
- Keys are encrypted with AES-256-GCM and stored per-user
- Best for: developer-oriented platforms, cost transparency

#### Mode 2: Platform provides shared keys (Recommended for public use)
- Admin sets API keys in server `.env` (e.g., `GOOGLE_AI_API_KEY=xxx`)
- All users share the platform's keys automatically
- Users can still override with their own keys in `/settings`
- Best for: SaaS products, team tools, public demos

To enable Mode 2, simply set the AI provider keys in your `.env`:
```bash
GOOGLE_AI_API_KEY=your-platform-key
OPENAI_API_KEY=your-platform-key       # optional
ANTHROPIC_API_KEY=your-platform-key     # optional
```

### User Quota System

Prevent abuse with configurable per-user limits:

```bash
# .env
QUOTA_MAX_PROJECTS_PER_DAY=5       # Max projects created per day
QUOTA_MAX_PROJECTS_TOTAL=50        # Max total projects per user
QUOTA_MAX_COST_PER_PROJECT=10      # Max $ spent on a single project
QUOTA_MAX_COST_PER_DAY=20          # Max $ spent per day
QUOTA_MAX_COST_PER_MONTH=100       # Max $ spent per month
```

The system automatically blocks new project creation when quotas are exceeded and shows clear error messages to users.

### Rate Limiting

Built-in IP-based rate limiting:
- **API endpoints**: 120 requests/minute
- **Auth endpoints**: 15 requests/minute
- Returns `429 Too Many Requests` with `Retry-After` header

### Health Check

Monitor your deployment:
```bash
curl https://your-domain.com/api/health
```

Returns:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-08T...",
  "checks": {
    "supabase": { "status": "ok", "latencyMs": 45 },
    "google_ai": { "status": "ok" },
    "encryption": { "status": "ok" },
    "ffmpeg": { "status": "ok", "message": "ffmpeg version 6.1..." }
  }
}
```

### Supabase Production Setup

1. **Upgrade to Pro** ($25/month) for production workloads:
   - 8 GB database
   - 100 GB storage
   - No auto-pause
   - Daily backups

2. **Enable Realtime** for `pipeline_events` and `projects` tables

3. **Configure Google OAuth**:
   - Supabase Dashboard > Authentication > Providers > Google
   - Enter your Google OAuth client ID and secret

### Security Checklist

- [ ] Generate a unique `ENCRYPTION_KEY` with `openssl rand -hex 32`
- [ ] Use Supabase Pro (no auto-pause, backups enabled)
- [ ] Set strong database password
- [ ] Enable RLS on all tables (migration already includes this)
- [ ] Configure custom domain with HTTPS
- [ ] Set `NEXT_PUBLIC_APP_URL` to your production domain
- [ ] Review and adjust quota limits for your use case

### Cost Estimates

| Component | Per Video | 100 users/month (est.) |
|-----------|----------|----------------------|
| AI calls (Fast) | $1.50 - $3.00 | $150 - $300 |
| AI calls (High) | $4.00 - $8.00 | $400 - $800 |
| Supabase Pro | — | $25/month |
| GCS Storage | — | $5 - $20/month |
| Vercel Pro | — | $20/month |
| Inngest Cloud | — | Free tier or $25/month |
| **Total platform** | — | **$50 - $70/month + AI costs** |

### Scaling Tips

1. **AI costs are the primary expense** — use quota limits to control spending
2. **GCS is cheap** — video storage costs are minimal
3. **Supabase scales well** — Pro tier handles thousands of users
4. **Consider caching** — StyleDNA results are cached by video hash (7-day TTL)
5. **Monitor with Langfuse** — track cost per user, per step, per model

## License

MIT
