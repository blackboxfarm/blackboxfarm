import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Mail, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  userId: string;
  userEmail: string;
  userCreatedAt: string;
}

type BannerState = 'loading' | 'verified' | 'gentle' | 'urgent' | 'hidden';

export function EmailVerificationBanner({ userId, userEmail, userCreatedAt }: Props) {
  const [state, setState] = useState<BannerState>('loading');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    checkVerification();
  }, [userId]);

  async function checkVerification() {
    try {
      const { data } = await supabase
        .from('email_verifications')
        .select('id, verified_at')
        .eq('user_id', userId)
        .eq('verification_type', 'signup')
        .not('verified_at', 'is', null)
        .limit(1);

      if (data && data.length > 0) {
        setState('verified');
        return;
      }

      // Check if user even has a pending verification (they may predate the system)
      const { data: pending } = await supabase
        .from('email_verifications')
        .select('id')
        .eq('user_id', userId)
        .eq('verification_type', 'signup')
        .limit(1);

      if (!pending || pending.length === 0) {
        setState('hidden'); // User predates the verification system
        return;
      }

      // Calculate urgency
      const createdAt = new Date(userCreatedAt);
      const hoursSinceSignup = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      // 7-day window: gentle for first 5 days, urgent for last 2 days
      setState(hoursSinceSignup >= 120 ? 'urgent' : 'gentle');
    } catch (err) {
      console.error('Failed to check email verification:', err);
      setState('hidden');
    }
  }

  async function resendVerification() {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-email', {
        body: { type: 'signup' },
      });

      if (error) throw error;
      if (data?.already_verified) {
        setState('verified');
        toast.success('Your email is already verified!');
      } else {
        toast.success('Verification email sent! Check your inbox.');
      }
    } catch (err) {
      toast.error('Failed to send verification email. Try again later.');
    } finally {
      setSending(false);
    }
  }

  if (state === 'loading' || state === 'verified' || state === 'hidden') return null;

  const isUrgent = state === 'urgent';

  return (
    <div className={`rounded-lg border p-4 flex items-start gap-3 ${
      isUrgent 
        ? 'bg-orange-500/10 border-orange-500/30 text-orange-200' 
        : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
    }`}>
      {isUrgent ? (
        <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-orange-400" />
      ) : (
        <Mail className="w-5 h-5 mt-0.5 shrink-0 text-blue-400" />
      )}
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium">
          {isUrgent
            ? '⚠️ Less than 2 days left to verify your email!'
            : '📧 Please verify your email within 7 days'}
        </p>
        <p className="text-xs opacity-80">
          {isUrgent
            ? `Please verify ${userEmail} soon to keep your account active. Check your inbox or resend below.`
            : `We sent a verification link to ${userEmail}. Click it to keep your account active.`}
        </p>
        <Button
          size="sm"
          variant={isUrgent ? 'default' : 'outline'}
          className="gap-1.5"
          onClick={resendVerification}
          disabled={sending}
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
          Resend Verification Email
        </Button>
      </div>
    </div>
  );
}
