'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ApiKeyManager } from '@/components/settings/ApiKeyManager';
import { CapabilityMatrix } from '@/components/settings/CapabilityMatrix';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import { ArrowLeft, Sparkles, Trash2 } from 'lucide-react';
import type { Provider } from '@/lib/types';
import { getAvailableProvidersFromKeys } from '@/services/modelRegistry';

interface ApiKeyEntry {
  provider: Provider;
  maskedKey: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([]);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
      return;
    }

    setEmail(user.email ?? '');
    setDisplayName(user.user_metadata?.display_name ?? user.email?.split('@')[0] ?? '');

    const { data: keys } = await supabase
      .from('user_api_keys')
      .select('provider, encrypted_key, created_at')
      .eq('user_id', user.id);

    if (keys) {
      setApiKeys(keys.map((k) => ({
        provider: k.provider as Provider,
        maskedKey: '****' + (k.encrypted_key?.slice(-8) ?? ''),
        createdAt: k.created_at,
      })));
    }

    setLoading(false);
  };

  const handleSaveKey = async (provider: Provider, apiKey: string): Promise<{ valid: boolean; message: string }> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { valid: false, message: 'Not authenticated' };

      const { encrypt } = await import('@/lib/encryption');
      const encryptedKey = encrypt(apiKey);

      const { error } = await supabase
        .from('user_api_keys')
        .upsert({
          user_id: user.id,
          provider,
          encrypted_key: encryptedKey,
        }, {
          onConflict: 'user_id,provider',
        });

      if (error) return { valid: false, message: error.message };

      await loadSettings();
      return { valid: true, message: `${provider} API key saved successfully` };
    } catch (err) {
      return { valid: false, message: String(err) };
    }
  };

  const handleDeleteKey = async (provider: Provider) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_api_keys')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider);

    await loadSettings();
  };

  const handleUpdateProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.auth.updateUser({
      data: { display_name: displayName },
    });

    await supabase
      .from('user_profiles')
      .upsert({
        id: user.id,
        display_name: displayName,
      });
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }
    await supabase.auth.signOut();
    router.push('/');
  };

  const availableProviders = getAvailableProvidersFromKeys(apiKeys);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-lg font-bold">Settings</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>
              Configure API keys for AI providers. At minimum, a Google AI key is required.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeyManager
              existingKeys={apiKeys}
              onSaveKey={handleSaveKey}
              onDeleteKey={handleDeleteKey}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capability Matrix</CardTitle>
            <CardDescription>
              Available capabilities based on your configured API keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CapabilityMatrix availableProviders={availableProviders} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} disabled />
            </div>

            <Button onClick={handleUpdateProfile}>Save Profile</Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={handleDeleteAccount}>
              <Trash2 className="h-4 w-4 mr-2" /> Delete Account
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
