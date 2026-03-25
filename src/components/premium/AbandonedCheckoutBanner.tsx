import { useState, useEffect } from 'react';
import { X, CreditCard, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

export function AbandonedCheckoutBanner() {
  const { user } = useAuth();
  const { tierKey } = useUserTier();
  const navigate = useNavigate();
  const [hasPendingCheckout, setHasPendingCheckout] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || tierKey !== 'free') return;

    // Check if dismissed this session
    const dismissedKey = `bbx_checkout_dismissed_${user.id}`;
    if (sessionStorage.getItem(dismissedKey)) return;

    const checkPending = async () => {
      // Look for pending checkout intents older than 10 minutes
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('checkout_intents')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .lt('created_at', tenMinAgo)
        .limit(1);

      if (data && data.length > 0) {
        setHasPendingCheckout(true);
      }
    };

    checkPending();
  }, [user, tierKey]);

  const handleDismiss = () => {
    setDismissed(true);
    if (user) {
      sessionStorage.setItem(`bbx_checkout_dismissed_${user.id}`, '1');
    }
  };

  if (!hasPendingCheckout || dismissed) return null;

  return (
    <div className="relative bg-gradient-to-r from-primary/15 via-accent/10 to-primary/15 border border-primary/30 rounded-lg p-4 mx-4 mt-4 animate-fade-in">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
      
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2 text-primary">
          <CreditCard className="h-5 w-5" />
          <span className="font-semibold text-sm">You left something behind!</span>
        </div>
        
        <p className="text-sm text-muted-foreground flex-1">
          Looks like you started a subscription but didn't finish. Pick up where you left off — your account is ready.
        </p>
        
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => navigate('/subscriptions#pricing')}
            className="gap-1.5"
          >
            <CreditCard className="h-3.5 w-3.5" />
            Continue Checkout
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate('/contact')}
            className="gap-1.5 text-muted-foreground"
          >
            <MessageCircleQuestion className="h-3.5 w-3.5" />
            Questions?
          </Button>
        </div>
      </div>
    </div>
  );
}
