import { useState, useEffect } from 'react';
import { Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { NotificationCenter } from '@/components/NotificationCenter';
import { useNotifications } from '@/hooks/useNotifications';

export function UserIdentityBadge() {
  const { user } = useAuth();
  const { showNotification } = useNotifications();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.display_name) {
        setDisplayName(data.display_name);
        setNameInput(data.display_name);
      }
      // Send welcome notification on first visit
      if (data && !data.onboarding_completed) {
        showNotification({
          type: 'system',
          level: 'success',
          title: '🎉 Welcome to BlackBox Farm!',
          message: 'Thanks for joining! Explore AI Holder Analysis, Bubble Maps, and connect your Telegram bot from the dashboard. Upgrade anytime for deeper insights.',
        });
        await supabase
          .from('profiles')
          .update({ onboarding_completed: true })
          .eq('user_id', user.id);
      }
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: nameInput.trim() || null })
        .eq('user_id', user.id);
      if (error) throw error;
      setDisplayName(nameInput.trim() || null);
      setProfileOpen(false);
      toast({ title: 'Profile updated' });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const { signOut } = useAuth();

  if (!user) return null;

  const label = displayName || user.email || 'User';

  return (
    <div className="flex items-center gap-1.5 md:gap-2">
      {/* User Identity Chip */}
      <div className="flex items-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-gold/10 border border-gold/40 shadow-[0_2px_8px_hsl(var(--gold)/0.15)]">
        <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-gold" />
        <span className="text-xs md:text-sm font-medium text-foreground max-w-[100px] md:max-w-[180px] truncate">
          {label}
        </span>

        {/* Gear icon for profile settings + logout */}
        <Popover open={profileOpen} onOpenChange={setProfileOpen}>
          <PopoverTrigger asChild>
            <button className="p-0.5 rounded hover:bg-gold/20 transition-colors">
              <Settings className="h-3.5 w-3.5 md:h-4 md:w-4 text-gold" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64" align="end">
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Edit Profile</h4>
              <div className="space-y-1.5">
                <Label className="text-xs">Display Name</Label>
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Enter your name (optional)"
                  className="h-8 text-sm"
                />
              </div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
              <Button size="sm" className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                className="w-full text-destructive hover:text-destructive gap-2"
                onClick={() => { setProfileOpen(false); signOut(); }}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Notification Bell */}
      <NotificationCenter />
    </div>
  );
}
