import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';
import { Link2Off, Lock, Loader2 } from 'lucide-react';

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email/Password',
  google: 'Google',
  twitter: 'X (Twitter)',
  discord: 'Discord',
  github: 'GitHub',
};

export function UnlinkProvider() {
  const { user } = useAuth();
  const [identities, setIdentities] = useState<any[]>([]);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [settingPassword, setSettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (user) {
      setIdentities(user.identities || []);
    }
  }, [user]);

  const hasEmailIdentity = identities.some((i) => i.provider === 'email');
  const canUnlink = identities.length > 1;

  const handleUnlink = async (identity: any) => {
    if (!canUnlink) {
      toast({
        title: 'Cannot unlink',
        description: 'You need at least one login method. Set a password first.',
        variant: 'destructive',
      });
      return;
    }
    setUnlinking(identity.id);
    try {
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      setIdentities((prev) => prev.filter((i) => i.id !== identity.id));
      toast({ title: `${PROVIDER_LABELS[identity.provider] || identity.provider} unlinked` });
    } catch (err: any) {
      toast({ title: 'Failed to unlink', description: err.message, variant: 'destructive' });
    } finally {
      setUnlinking(null);
    }
  };

  const handleSetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setSettingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password set successfully' });
      setNewPassword('');
      // Refresh identities
      const { data } = await supabase.auth.getUser();
      if (data.user) setIdentities(data.user.identities || []);
    } catch (err: any) {
      toast({ title: 'Failed to set password', description: err.message, variant: 'destructive' });
    } finally {
      setSettingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1">
        <Lock className="h-3 w-3" />
        Linked Accounts
      </Label>
      <div className="space-y-1">
        {identities.map((identity) => (
          <div key={identity.id} className="flex items-center justify-between text-xs py-1">
            <Badge variant="outline" className="text-[10px]">
              {PROVIDER_LABELS[identity.provider] || identity.provider}
            </Badge>
            {identity.provider !== 'email' && (
              <button
                onClick={() => handleUnlink(identity)}
                disabled={!canUnlink || unlinking === identity.id}
                className="text-[10px] text-destructive hover:underline disabled:opacity-50 flex items-center gap-0.5"
              >
                {unlinking === identity.id ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Link2Off className="h-2.5 w-2.5" />
                )}
                Unlink
              </button>
            )}
          </div>
        ))}
      </div>

      {!hasEmailIdentity && (
        <div className="space-y-1.5 pt-1 border-t border-border/50">
          <Label className="text-[10px] text-muted-foreground">
            Set a password to enable email login
          </Label>
          <div className="flex gap-1.5">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="h-7 text-xs rounded border border-input bg-input px-2 flex-1"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px]"
              onClick={handleSetPassword}
              disabled={settingPassword || !newPassword}
            >
              {settingPassword ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Set'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
