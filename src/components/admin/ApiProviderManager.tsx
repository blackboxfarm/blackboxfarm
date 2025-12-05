import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, AlertTriangle, Check, X, Zap } from 'lucide-react';

interface ApiProvider {
  id: string;
  provider_name: string;
  is_enabled: boolean;
  priority: number;
  rate_limit_remaining: number | null;
  last_error_at: string | null;
  error_count: number;
  updated_at: string;
}

const PROVIDER_INFO: Record<string, { name: string; description: string; color: string }> = {
  helius: {
    name: 'Helius',
    description: 'Premium RPC + Enhanced APIs (transaction history, token metadata)',
    color: 'bg-purple-500'
  },
  solscan: {
    name: 'Solscan',
    description: 'Transaction history and token data API',
    color: 'bg-blue-500'
  },
  shyft: {
    name: 'Shyft',
    description: 'Alternative RPC and API provider',
    color: 'bg-green-500'
  },
  public_rpc: {
    name: 'Public RPC',
    description: 'Free Solana RPC endpoints (rate-limited)',
    color: 'bg-gray-500'
  }
};

export function ApiProviderManager() {
  const [providers, setProviders] = useState<ApiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchProviders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('api_provider_config')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;
      setProviders(data || []);
    } catch (error: any) {
      toast({
        title: 'Error fetching providers',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const toggleProvider = async (providerId: string, currentState: boolean) => {
    setUpdating(providerId);
    try {
      const { error } = await supabase
        .from('api_provider_config')
        .update({ is_enabled: !currentState })
        .eq('id', providerId);

      if (error) throw error;

      setProviders(prev =>
        prev.map(p => (p.id === providerId ? { ...p, is_enabled: !currentState } : p))
      );

      const provider = providers.find(p => p.id === providerId);
      toast({
        title: `${PROVIDER_INFO[provider?.provider_name || '']?.name || 'Provider'} ${!currentState ? 'enabled' : 'disabled'}`,
        description: !currentState 
          ? 'API calls will now use this provider'
          : 'API calls will skip this provider'
      });
    } catch (error: any) {
      toast({
        title: 'Error updating provider',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setUpdating(null);
    }
  };

  const disableHeliusEmergency = async () => {
    const heliusProvider = providers.find(p => p.provider_name === 'helius');
    if (heliusProvider && heliusProvider.is_enabled) {
      await toggleProvider(heliusProvider.id, true);
    }
  };

  const enabledCount = providers.filter(p => p.is_enabled).length;
  const heliusEnabled = providers.find(p => p.provider_name === 'helius')?.is_enabled;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              API Provider Configuration
            </CardTitle>
            <CardDescription>
              Manage which API providers are used for RPC calls and data fetching.
              The system will automatically fallback to enabled providers.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchProviders} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Emergency Helius Disable Button */}
        {heliusEnabled && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Helius Credits Low?</p>
                  <p className="text-sm text-muted-foreground">
                    Instantly disable Helius and switch to fallback providers
                  </p>
                </div>
              </div>
              <Button 
                variant="destructive" 
                onClick={disableHeliusEmergency}
                disabled={updating !== null}
              >
                Emergency Disable Helius
              </Button>
            </div>
          </div>
        )}

        {/* Status Summary */}
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <Badge variant={enabledCount > 0 ? 'default' : 'destructive'}>
            {enabledCount} / {providers.length} providers enabled
          </Badge>
          {!heliusEnabled && (
            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              Helius disabled - using fallbacks
            </Badge>
          )}
        </div>

        {/* Provider List */}
        <div className="space-y-3">
          {providers.map(provider => {
            const info = PROVIDER_INFO[provider.provider_name] || {
              name: provider.provider_name,
              description: 'Unknown provider',
              color: 'bg-gray-500'
            };

            return (
              <div
                key={provider.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  provider.is_enabled ? 'bg-card' : 'bg-muted/30 opacity-75'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${info.color}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{info.name}</span>
                      <Badge variant="outline" className="text-xs">
                        Priority: {provider.priority}
                      </Badge>
                      {provider.is_enabled ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{info.description}</p>
                    {provider.last_error_at && (
                      <p className="text-xs text-destructive mt-1">
                        Last error: {new Date(provider.last_error_at).toLocaleString()}
                        {provider.error_count > 0 && ` (${provider.error_count} errors)`}
                      </p>
                    )}
                  </div>
                </div>
                <Switch
                  checked={provider.is_enabled}
                  onCheckedChange={() => toggleProvider(provider.id, provider.is_enabled)}
                  disabled={updating === provider.id}
                />
              </div>
            );
          })}
        </div>

        {/* Help Text */}
        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
          <p className="font-medium mb-1">How fallbacks work:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>The system tries providers in priority order (lower number = higher priority)</li>
            <li>If a provider fails or is disabled, it automatically tries the next one</li>
            <li>Public RPC is always available as a last resort (but rate-limited)</li>
            <li>Disabling Helius stops all Helius API credit usage immediately</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
