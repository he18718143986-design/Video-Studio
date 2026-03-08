# SciVid AI — AI Science Video Generator

An AI-powered web application that generates science animation videos by analyzing a reference video's style and applying it to a new topic through a 13-step hybrid pipeline.

## Features

- **Style DNA Extraction**: Analyzes reference video for visual style, narrative structure, and audio characteristics
- **13-Step AI Pipeline**: Safety check, research, scripting, storyboard, visual production, TTS, and rendering
- **Multi-Provider Support**: Google (Gemini/Veo), OpenAI, Anthropic, ElevenLabs, Stability, Kling, Runway
- **Real-time Progress**: Server-Sent Events for live pipeline tracking
- **Cost Tracking**: Per-step cost monitoring with Langfuse integration
- **Multi-language**: English and Chinese support with auto-detection

## Prerequisites

- Node.js 18+
- FFmpeg (for video rendering)
- Supabase account (database + auth)
- Google Cloud Storage bucket
- At least one AI provider API key (Google AI recommended)

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url>
cd ai-science-video-generator
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
- **Recommended**: `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`

### 3. Set up Supabase

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

Or manually run `supabase/migrations/001_initial.sql` in the Supabase SQL editor.

### 4. Set up Google Cloud Storage

```bash
# Create bucket
gsutil mb -l us-central1 gs://your-bucket-name

# Set CORS for browser access
gsutil cors set cors.json gs://your-bucket-name
```

### 5. Start Inngest dev server

```bash
npx inngest-cli@latest dev
```

### 6. Start development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
- **Storage**: Google Cloud Storage
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

## Production Deployment

### Vercel (Frontend)

```bash
vercel --prod
```

Set all environment variables in Vercel dashboard.

### Railway (Backend / Inngest)

1. Connect GitHub repository
2. Set environment variables
3. Deploy

### Environment Checklist

- [ ] Supabase project created and configured
- [ ] Database migrations applied
- [ ] RLS policies active
- [ ] GCS bucket created with CORS configured
- [ ] Service account key for GCS
- [ ] At least Google AI API key configured
- [ ] ENCRYPTION_KEY generated (`openssl rand -hex 32`)
- [ ] Inngest configured (cloud or self-hosted)
- [ ] Langfuse configured (optional, for observability)
- [ ] Supabase Realtime enabled for `pipeline_events` and `projects` tables

## Cost Estimates

| Component | Approx. Cost per Video |
|-----------|----------------------|
| Text reasoning (script, storyboard) | $0.05 - $0.15 |
| Image generation (keyframes) | $0.30 - $0.60 |
| Video generation (Veo Fast) | $1.00 - $2.00 |
| TTS (Gemini) | $0.01 - $0.05 |
| **Total (Fast mode)** | **~$1.50 - $3.00** |
| **Total (High mode)** | **~$4.00 - $8.00** |

## License

MIT
