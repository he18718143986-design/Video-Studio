-- Users (managed by Supabase Auth, extended here)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- API Keys (encrypted at rest)
create table if not exists user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_profiles(id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  created_at timestamptz default now(),
  unique(user_id, provider)
);

-- Projects
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references user_profiles(id) on delete cascade,
  title text not null,
  reference_video_url text,
  new_topic text not null,
  target_duration_sec integer default 120,
  quality text default 'fast',
  language text default 'auto',
  status text default 'pending',
  current_step integer default 0,
  style_dna jsonb,
  capability_assessment jsonb,
  research_report jsonb,
  narrative_map jsonb,
  script jsonb,
  storyboard jsonb,
  reference_sheet_url text,
  final_video_url text,
  total_cost_usd numeric(10, 4) default 0,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Scenes
create table if not exists scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  scene_index integer not null,
  beat text,
  voiceover_text text,
  visual_prompt text,
  camera_motion text,
  key_elements text[],
  estimated_duration_sec numeric(5, 2),
  actual_audio_duration_sec numeric(5, 2),
  audio_url text,
  keyframe_url text,
  video_url text,
  rendered_scene_url text,
  used_t2v_fallback boolean default false,
  status text default 'pending',
  created_at timestamptz default now(),
  unique(project_id, scene_index)
);

-- Pipeline Events (drives SSE progress stream)
create table if not exists pipeline_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  step_number integer not null,
  step_name text not null,
  status text not null,
  message text,
  cost_usd numeric(8, 4),
  model_used text,
  duration_ms integer,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_projects_user_id on projects(user_id, created_at desc);
create index if not exists idx_scenes_project_id on scenes(project_id, scene_index);
create index if not exists idx_pipeline_events_project_id on pipeline_events(project_id, created_at desc);

-- Row Level Security
alter table user_profiles enable row level security;
alter table user_api_keys enable row level security;
alter table projects enable row level security;
alter table scenes enable row level security;
alter table pipeline_events enable row level security;

-- RLS Policies: user_profiles
create policy "Users can view own profile"
  on user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on user_profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on user_profiles for insert
  with check (auth.uid() = id);

-- RLS Policies: user_api_keys
create policy "Users can view own api keys"
  on user_api_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert own api keys"
  on user_api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update own api keys"
  on user_api_keys for update
  using (auth.uid() = user_id);

create policy "Users can delete own api keys"
  on user_api_keys for delete
  using (auth.uid() = user_id);

-- RLS Policies: projects
create policy "Users can view own projects"
  on projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on projects for delete
  using (auth.uid() = user_id);

-- RLS Policies: scenes
create policy "Users can view own scenes"
  on scenes for select
  using (
    exists (
      select 1 from projects
      where projects.id = scenes.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert own scenes"
  on scenes for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = scenes.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can update own scenes"
  on scenes for update
  using (
    exists (
      select 1 from projects
      where projects.id = scenes.project_id
      and projects.user_id = auth.uid()
    )
  );

-- RLS Policies: pipeline_events
create policy "Users can view own pipeline events"
  on pipeline_events for select
  using (
    exists (
      select 1 from projects
      where projects.id = pipeline_events.project_id
      and projects.user_id = auth.uid()
    )
  );

create policy "Users can insert pipeline events"
  on pipeline_events for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = pipeline_events.project_id
      and projects.user_id = auth.uid()
    )
  );

-- Enable realtime for pipeline_events and projects
alter publication supabase_realtime add table pipeline_events;
alter publication supabase_realtime add table projects;

-- Function to auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for auto profile creation
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
