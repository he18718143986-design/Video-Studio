'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Sparkles, Video, Clock, DollarSign, LogOut } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface ProjectItem {
  id: string;
  title: string;
  new_topic: string;
  status: string;
  current_step: number;
  total_cost_usd: number;
  created_at: string;
  reference_sheet_url: string | null;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const router = useRouter();

  const fetchProjects = useCallback(async (): Promise<ProjectItem[] | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return null;
    }

    const { data } = await supabase
      .from('projects')
      .select('id, title, new_topic, status, current_step, total_cost_usd, created_at, reference_sheet_url')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    return data ?? [];
  }, [router, supabase]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const nextProjects = await fetchProjects();
      if (cancelled || !nextProjects) {
        setLoading(false);
        return;
      }

      setProjects(nextProjects);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchProjects]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'complete':
        return <Badge variant="success">Complete</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="default">{status.replace('step_', 'Step ')}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">SciVid AI</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/settings">
                <Button variant="ghost" size="sm">Settings</Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1" /> Sign Out
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground mt-1">Manage your science video projects</p>
          </div>
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <div className="h-32 bg-muted rounded-md" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 space-y-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Video className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">No Projects Yet</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                Create your first AI science video project by uploading a reference video and providing a topic.
              </p>
              <Link href="/projects/new">
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> Create First Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5 h-full">
                  <CardContent className="p-5 space-y-4">
                    <div className="relative aspect-video rounded-md overflow-hidden bg-muted flex items-center justify-center">
                      {project.reference_sheet_url ? (
                        <Image
                          src={project.reference_sheet_url}
                          alt={project.title}
                          fill
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                          className="object-cover"
                        />
                      ) : (
                        <Video className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold truncate">{project.title}</h3>
                      <p className="text-sm text-muted-foreground truncate">{project.new_topic}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      {getStatusBadge(project.status)}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {Number(project.total_cost_usd).toFixed(4)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
