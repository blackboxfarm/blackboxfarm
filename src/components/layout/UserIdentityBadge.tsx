import { useState, useEffect } from 'react';
import { Settings, User } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationCenter } from '@/components/NotificationCenter';
import { ProfilePanel } from '@/components/profile/ProfilePanel';

export function UserIdentityBadge() {
  const { user } = useAuth();
  const { showNotification } = useNotifications();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.display_name) setDisplayName(data.display_name);
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

  if (!user) return null;

  const label = displayName || user.email || 'User';

  return (
    <div className="flex items-center gap-1.5 md:gap-2">
      <div className="flex items-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-full bg-gold/10 border border-gold/40 shadow-[0_2px_8px_hsl(var(--gold)/0.15)]">
        <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-gold" />
        <span className="text-xs md:text-sm font-medium text-foreground max-w-[100px] md:max-w-[180px] truncate">
          {label}
        </span>
        <button
          className="p-0.5 rounded hover:bg-gold/20 transition-colors"
          onClick={() => setProfileOpen(true)}
        >
          <Settings className="h-3.5 w-3.5 md:h-4 md:w-4 text-gold" />
        </button>
      </div>

      <NotificationCenter />

      <ProfilePanel open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
