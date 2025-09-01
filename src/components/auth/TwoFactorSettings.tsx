import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield, Smartphone, QrCode, Key, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { TwoFactorSetup } from './TwoFactorSetup';

export const TwoFactorSettings = () => {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disabling, setDisabling] = useState(false);
  const [trustedDevices, setTrustedDevices] = useState<any[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    loadTwoFactorStatus();
    loadTrustedDevices();
  }, [user]);

  const loadTwoFactorStatus = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('two_factor_enabled')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setTwoFactorEnabled(data?.two_factor_enabled || false);
    } catch (error) {
      console.error('Error loading 2FA status:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrustedDevices = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.functions.invoke('get-trusted-devices', {
        body: { userId: user.id }
      });

      if (error) throw error;
      setTrustedDevices(data?.devices || []);
    } catch (error) {
      console.error('Error loading trusted devices:', error);
    }
  };

  const disableTwoFactor = async () => {
    if (!user) return;

    setDisabling(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          two_factor_enabled: false,
          two_factor_secret: null 
        })
        .eq('user_id', user.id);

      if (error) throw error;

      // Remove all trusted devices
      await supabase.functions.invoke('remove-all-trusted-devices', {
        body: { userId: user.id }
      });

      setTwoFactorEnabled(false);
      setTrustedDevices([]);
      
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled for your account.",
      });
    } catch (error: any) {
      console.error('Error disabling 2FA:', error);
      toast({
        title: "Error",
        description: "Failed to disable two-factor authentication.",
        variant: "destructive",
      });
    } finally {
      setDisabling(false);
    }
  };

  const removeTrustedDevice = async (deviceId: string) => {
    try {
      const { error } = await supabase.functions.invoke('remove-trusted-device', {
        body: { deviceId }
      });

      if (error) throw error;

      setTrustedDevices(devices => devices.filter(d => d.id !== deviceId));
      
      toast({
        title: "Device Removed",
        description: "The trusted device has been removed.",
      });
    } catch (error: any) {
      console.error('Error removing trusted device:', error);
      toast({
        title: "Error",
        description: "Failed to remove trusted device.",
        variant: "destructive",
      });
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    loadTwoFactorStatus();
    toast({
      title: "2FA Enabled!",
      description: "Two-factor authentication has been successfully enabled.",
    });
  };

  if (loading) {
    return (
      <Card className="tech-border">
        <CardContent className="p-6">
          <div className="text-center">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (showSetup) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          onClick={() => setShowSetup(false)}
          className="mb-4"
        >
          ← Back to Settings
        </Button>
        <TwoFactorSetup onComplete={handleSetupComplete} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="tech-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Label>Status</Label>
                <Badge variant={twoFactorEnabled ? "default" : "secondary"}>
                  {twoFactorEnabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {twoFactorEnabled 
                  ? "Your account is protected with two-factor authentication"
                  : "Enable 2FA to add an extra layer of security to your account"
                }
              </p>
            </div>
            
            {!twoFactorEnabled ? (
              <Button 
                onClick={() => setShowSetup(true)}
                className="tech-button"
              >
                <QrCode className="mr-2 h-4 w-4" />
                Enable 2FA
              </Button>
            ) : (
              <Button 
                variant="destructive"
                onClick={disableTwoFactor}
                disabled={disabling}
              >
                <AlertTriangle className="mr-2 h-4 w-4" />
                Disable 2FA
              </Button>
            )}
          </div>

          {twoFactorEnabled && (
            <>
              <Separator />
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  <Label>Trusted Devices</Label>
                </div>
                
                {trustedDevices.length > 0 ? (
                  <div className="space-y-2">
                    {trustedDevices.map((device) => (
                      <div key={device.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-1">
                          <p className="font-medium">{device.device_name || 'Unknown Device'}</p>
                          <p className="text-sm text-muted-foreground">
                            Added: {new Date(device.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeTrustedDevice(device.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription>
                      No trusted devices. You'll be asked for your OTP code on every sign-in.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};