-- =============================================================================
-- SciVid AI — 数据库初始化 Migration
-- 版本: 1.0
-- 说明: 包含5张核心表、RLS策略、索引和触发器
-- =============================================================================

-- -------------------------
-- 扩展（必须在最前面）
-- -------------------------
create extension if not exists "uuid-ossp";


-- =============================================================================
-- 1. user_profiles — 用户元数据（扩展 auth.users）
-- =============================================================================
create table if not exists user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at  timestamptz default now() not null
);

comment on table user_profiles is '扩展 Supabase Auth 的用户元数据，与 auth.users 1:1 关联';
comment on column user_profiles.id is '与 auth.users.id 相同，通过触发器自动创建';


-- =============================================================================
-- 2. user_api_keys — 加密存储的 AI 供应商 API 密钥
-- =============================================================================
-- 注意：外键指向 auth.users 而非 user_profiles，避免触发器时序问题
create table if not exists user_api_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,
  encrypted_key text not null,
  created_at    timestamptz default now() not null,

  -- 每个用户每个供应商只能有一条记录
  unique(user_id, provider),

  -- 校验供应商名称合法性
  constraint valid_provider check (
    provider in ('google', 'openai', 'anthropic', 'elevenlabs', 'stability', 'kling', 'runway')
  )
);

comment on table user_api_keys is '用户自带的 AI API 密钥，AES-256-GCM 加密后存储，应用层解密';
comment on column user_api_keys.encrypted_key is '格式: iv_hex:auth_tag_hex:ciphertext_hex';


-- =============================================================================
-- 3. projects — 核心项目表
--    重要设计说明：
--    - 管道中间产物（style_dna/script/storyboard等）以 JSONB 存储，
--      因为这些数据结构复杂且每步整体覆写，JSONB 能原子更新
--    - 不对 JSONB 字段内部建索引，因为读取都通过 project_id 精确查询
-- =============================================================================
create table if not exists projects (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- 基础配置
  title               text not null,
  reference_video_url text,
  new_topic           text not null,
  target_duration_sec integer not null default 120,
  quality             text not null default 'fast',
  language            text not null default 'auto',

  -- 管道状态
  status              text not null default 'pending',
  current_step        integer not null default 0,
  error_message       text,

  -- 成本追踪
  total_cost_usd      numeric(10, 6) not null default 0,

  -- 管道中间产物（JSONB）
  -- 每个字段对应一个管道步骤的输出，由 Inngest 函数写入
  capability_assessment jsonb,  -- Step 2a 输出
  style_dna             jsonb,  -- Step 2b 输出
  research_report       jsonb,  -- Step 3 输出
  narrative_map         jsonb,  -- Step 4 输出
  script                jsonb,  -- Step 5 输出（经 Step 6 QA 校验后覆写）
  storyboard            jsonb,  -- Step 7 输出

  -- 最终产物
  reference_sheet_url text,     -- Step 8 输出
  final_video_url     text,     -- Step 12 输出

  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null,

  -- 约束
  constraint valid_status check (
    status in (
      'pending',
      'step_1', 'step_2', 'step_3', 'step_4', 'step_5', 'step_6',
      'step_7', 'step_8', 'step_9', 'step_10', 'step_11', 'step_12',
      'complete', 'failed'
    )
  ),
  constraint valid_quality check (quality in ('fast', 'high')),
  constraint valid_duration check (target_duration_sec between 30 and 300)
);

comment on table projects is '核心业务表，每个视频生成任务对应一条记录';
comment on column projects.storyboard is
  '包含所有场景的完整脚本和视觉描述。注意：媒体资产URL由 scenes 表单独追踪（双写设计）';


-- =============================================================================
-- 4. scenes — 场景媒体资产表
--
-- 双写设计说明：
--   场景数据存在于两处：
--   a) projects.storyboard（JSONB）：存完整的场景结构，由 Step7 批量写入
--   b) 此表：存媒体资产URL和状态，Step9/10/11 逐场景并发更新
--
--   原因：Step9/10/11 是并发执行的，如果都更新 projects.storyboard 整个 JSONB
--   会产生竞态条件（后写覆盖先写）。scenes 表允许按 scene_index 精确更新单行。
--   Step12 渲染时将两者合并：基础结构来自 storyboard JSONB，URL 来自此表。
-- =============================================================================
create table if not exists scenes (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references projects(id) on delete cascade,
  scene_index             integer not null,

  -- 脚本信息（冗余自 storyboard JSONB，便于单场景查询）
  beat                    text,
  voiceover_text          text,
  visual_prompt           text,
  camera_motion           text,
  key_elements            text[],
  estimated_duration_sec  numeric(6, 2),

  -- 媒体资产（Step 9/10/11 逐步填充）
  keyframe_url            text,   -- Step 9 填充
  video_url               text,   -- Step 10 填充
  audio_url               text,   -- Step 11 填充
  actual_audio_duration_sec numeric(6, 2), -- Step 11 测量后写入

  -- 渲染信息
  rendered_scene_url      text,
  used_t2v_fallback       boolean not null default false,

  -- 状态追踪
  status                  text not null default 'pending',

  created_at              timestamptz default now() not null,

  -- 每个项目内 scene_index 唯一
  unique(project_id, scene_index),

  constraint valid_scene_status check (
    status in ('pending', 'generating_image', 'generating_video', 'generating_audio', 'rendered', 'failed')
  )
);

comment on table scenes is
  '场景媒体资产追踪表。与 projects.storyboard JSONB 构成双写关系，解决并发更新竞态问题';


-- =============================================================================
-- 5. pipeline_events — 管道步骤事件日志
--    用途：
--    a) SSE 接口订阅此表的 Realtime INSERT 事件，推送进度到前端
--    b) 记录每步的耗时和成本，用于 Langfuse 可观测性
-- =============================================================================
create table if not exists pipeline_events (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  step_number integer not null,
  step_name   text not null,
  status      text not null,
  message     text,
  cost_usd    numeric(8, 6),
  model_used  text,
  duration_ms integer,
  created_at  timestamptz default now() not null,

  constraint valid_event_status check (
    status in ('started', 'completed', 'failed', 'skipped')
  )
);

comment on table pipeline_events is '管道步骤的事件日志，驱动前端 SSE 实时进度显示';


-- =============================================================================
-- 索引策略
-- =============================================================================

-- projects: 用户项目列表（主要查询模式）
create index if not exists idx_projects_user_created
  on projects(user_id, created_at desc);

-- projects: 配额查询（按日期范围聚合）
create index if not exists idx_projects_user_status
  on projects(user_id, status, created_at desc);

-- projects: 成本聚合查询（quota 检查用）
create index if not exists idx_projects_cost_agg
  on projects(user_id, created_at, total_cost_usd);

-- scenes: 按项目查询场景（最常用查询）
create index if not exists idx_scenes_project_index
  on scenes(project_id, scene_index);

-- pipeline_events: SSE 历史回放（项目打开时加载已有事件）
create index if not exists idx_pipeline_events_project_created
  on pipeline_events(project_id, created_at asc);

-- user_api_keys: 按用户查询所有密钥
create index if not exists idx_api_keys_user_id
  on user_api_keys(user_id);


-- =============================================================================
-- 行级安全策略（RLS）
-- =============================================================================
-- 策略说明：
-- - 所有表开启 RLS
-- - 服务端 Inngest 函数使用 service_role 绕过 RLS（正常行为）
-- - 前端只通过 anon key 访问，受 RLS 约束
-- =============================================================================

alter table user_profiles   enable row level security;
alter table user_api_keys   enable row level security;
alter table projects        enable row level security;
alter table scenes          enable row level security;
alter table pipeline_events enable row level security;

-- ---- user_profiles ----
create policy "own_profile_select"
  on user_profiles for select
  using (auth.uid() = id);

create policy "own_profile_insert"
  on user_profiles for insert
  with check (auth.uid() = id);

create policy "own_profile_update"
  on user_profiles for update
  using (auth.uid() = id);

-- ---- user_api_keys ----
create policy "own_keys_select"
  on user_api_keys for select
  using (auth.uid() = user_id);

create policy "own_keys_insert"
  on user_api_keys for insert
  with check (auth.uid() = user_id);

create policy "own_keys_update"
  on user_api_keys for update
  using (auth.uid() = user_id);

create policy "own_keys_delete"
  on user_api_keys for delete
  using (auth.uid() = user_id);

-- ---- projects ----
create policy "own_projects_select"
  on projects for select
  using (auth.uid() = user_id);

create policy "own_projects_insert"
  on projects for insert
  with check (auth.uid() = user_id);

create policy "own_projects_update"
  on projects for update
  using (auth.uid() = user_id);

create policy "own_projects_delete"
  on projects for delete
  using (auth.uid() = user_id);

-- ---- scenes ----
-- 通过 project_id 关联验证所有权
create policy "own_scenes_select"
  on scenes for select
  using (
    exists (
      select 1 from projects
      where projects.id = scenes.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "own_scenes_insert"
  on scenes for insert
  with check (
    exists (
      select 1 from projects
      where projects.id = scenes.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "own_scenes_update"
  on scenes for update
  using (
    exists (
      select 1 from projects
      where projects.id = scenes.project_id
        and projects.user_id = auth.uid()
    )
  );

-- ---- pipeline_events ----
-- SELECT: 用户可查看自己项目的事件（前端 SSE 历史回放）
create policy "own_events_select"
  on pipeline_events for select
  using (
    exists (
      select 1 from projects
      where projects.id = pipeline_events.project_id
        and projects.user_id = auth.uid()
    )
  );

-- INSERT: 仅 service_role 可写入（Inngest 服务端调用）
-- 注意：这里不需要 anon key 的 INSERT 策略
-- service_role 绕过 RLS，所以 Inngest 写入不受此约束
-- 但为防止前端误写，显式禁止 anon 插入（不添加 INSERT policy = 默认拒绝）


-- =============================================================================
-- 触发器：用户注册时自动创建 user_profiles
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;  -- 幂等，防止重复触发
  return new;
end;
$$;

-- 绑定触发器
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

comment on function public.handle_new_user() is
  '用户注册时自动创建 user_profiles 记录，使用 display_name meta 或 email 前缀作为显示名';


-- =============================================================================
-- 触发器：自动更新 projects.updated_at
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at
  before update on projects
  for each row
  execute function public.set_updated_at();


-- =============================================================================
-- Realtime 订阅配置
-- 说明：SSE 路由通过 Supabase Realtime 监听这两张表的变更
-- =============================================================================

-- 检查 publication 是否存在，避免重复添加报错
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'pipeline_events'
  ) then
    alter publication supabase_realtime add table pipeline_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table projects;
  end if;
end $$;


-- =============================================================================
-- Storage 配置说明
-- =============================================================================

-- 注意：
-- - 不要在本文件中手动取消注释来创建 storage bucket / policy。
-- - Storage 初始化已拆分到 `002_storage_uploads.sql`，用于保证本地上传流程可直接使用。
-- - 这样做可避免 001 与后续 migration 重复定义导致的行为不一致。
--
-- 正确做法：
--   1) 保持本文件不改动（不要补写 storage SQL）
--   2) 执行 `supabase db push`，让 002 migration 自动创建：
--      - bucket: videos
--      - RLS policy: 仅允许用户访问 uploads/{auth.uid()}/... 下的对象
--      - 读取策略: videos bucket 可读（用于前端回放参考视频）
