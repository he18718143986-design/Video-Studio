import { supabaseAdmin } from '@/lib/supabase';

export interface QuotaConfig {
  maxProjectsPerDay: number;
  maxProjectsTotal: number;
  maxCostPerProject: number;
  maxCostPerDay: number;
  maxCostPerMonth: number;
}

const DEFAULT_QUOTA: QuotaConfig = {
  maxProjectsPerDay: Number(process.env.QUOTA_MAX_PROJECTS_PER_DAY ?? 5),
  maxProjectsTotal: Number(process.env.QUOTA_MAX_PROJECTS_TOTAL ?? 50),
  maxCostPerProject: Number(process.env.QUOTA_MAX_COST_PER_PROJECT ?? 10),
  maxCostPerDay: Number(process.env.QUOTA_MAX_COST_PER_DAY ?? 20),
  maxCostPerMonth: Number(process.env.QUOTA_MAX_COST_PER_MONTH ?? 100),
};

export function getQuotaConfig(): QuotaConfig {
  return DEFAULT_QUOTA;
}

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  usage: {
    projectsToday: number;
    projectsTotal: number;
    costToday: number;
    costThisMonth: number;
  };
  limits: QuotaConfig;
}

export async function checkUserQuota(userId: string): Promise<QuotaCheckResult> {
  const config = getQuotaConfig();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [totalResult, todayResult, costTodayResult, costMonthResult] = await Promise.all([
    supabaseAdmin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),

    supabaseAdmin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString()),

    supabaseAdmin
      .from('projects')
      .select('total_cost_usd')
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString()),

    supabaseAdmin
      .from('projects')
      .select('total_cost_usd')
      .eq('user_id', userId)
      .gte('created_at', monthStart.toISOString()),
  ]);

  const projectsTotal = totalResult.count ?? 0;
  const projectsToday = todayResult.count ?? 0;

  const costToday = (costTodayResult.data ?? []).reduce(
    (sum, p) => sum + Number((p as { total_cost_usd: number }).total_cost_usd ?? 0), 0
  );
  const costThisMonth = (costMonthResult.data ?? []).reduce(
    (sum, p) => sum + Number((p as { total_cost_usd: number }).total_cost_usd ?? 0), 0
  );

  const usage = { projectsToday, projectsTotal, costToday, costThisMonth };

  if (projectsToday >= config.maxProjectsPerDay) {
    return { allowed: false, reason: `Daily project limit reached (${config.maxProjectsPerDay}/day)`, usage, limits: config };
  }

  if (projectsTotal >= config.maxProjectsTotal) {
    return { allowed: false, reason: `Total project limit reached (${config.maxProjectsTotal})`, usage, limits: config };
  }

  if (costToday >= config.maxCostPerDay) {
    return { allowed: false, reason: `Daily cost limit reached ($${config.maxCostPerDay}/day)`, usage, limits: config };
  }

  if (costThisMonth >= config.maxCostPerMonth) {
    return { allowed: false, reason: `Monthly cost limit reached ($${config.maxCostPerMonth}/month)`, usage, limits: config };
  }

  return { allowed: true, usage, limits: config };
}

export async function checkProjectCostQuota(
  projectId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const config = getQuotaConfig();

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('total_cost_usd')
    .eq('id', projectId)
    .single();

  if (!project) return { allowed: false, reason: 'Project not found' };

  const currentCost = Number(project.total_cost_usd ?? 0);
  if (currentCost >= config.maxCostPerProject) {
    return { allowed: false, reason: `Project cost limit reached ($${config.maxCostPerProject})` };
  }

  return { allowed: true };
}
