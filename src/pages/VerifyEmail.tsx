import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

type VerifyState = 'loading' | 'success' | 'reactivated' | 'already_verified' | 'expired' | 'error';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<VerifyState>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('error');
      setMessage('No verification token provided.');
      return;
    }

    const verify = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('verify-email-token', {
          body: null,
          headers: {},
          method: 'GET',
        });

        // Use fetch directly since invoke doesn't support query params well
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-email-token?token=${token}`,
          {
            method: 'GET',
            headers: {
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          }
        );

        const result = await response.json();

        if (!response.ok) {
          if (response.status === 410) {
            setState('expired');
            setMessage(result.error || 'This verification link has expired.');
          } else {
            setState('error');
            setMessage(result.error || 'Verification failed.');
          }
          return;
        }

        if (result.already_verified) {
          setState('already_verified');
          setMessage('Your email is already verified!');
        } else if (result.verification_type === 'reactivation') {
          setState('reactivated');
          setMessage('Your account has been reactivated! You can now sign in.');
        } else {
          setState('success');
          setMessage('Your email has been verified successfully!');
        }
      } catch (err) {
        setState('error');
        setMessage('Something went wrong. Please try again.');
      }
    };

    verify();
  }, [searchParams]);

  const iconMap = {
    loading: <Loader2 className="w-16 h-16 text-primary animate-spin" />,
    success: <CheckCircle className="w-16 h-16 text-green-500" />,
    reactivated: <ShieldCheck className="w-16 h-16 text-green-500" />,
    already_verified: <CheckCircle className="w-16 h-16 text-blue-500" />,
    expired: <AlertTriangle className="w-16 h-16 text-yellow-500" />,
    error: <XCircle className="w-16 h-16 text-destructive" />,
  };

  const titleMap = {
    loading: 'Verifying...',
    success: 'Email Verified! ✅',
    reactivated: 'Account Reactivated! 🎉',
    already_verified: 'Already Verified',
    expired: 'Link Expired',
    error: 'Verification Failed',
  };

  return (
    <SiteLayout>
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full tech-border">
          <CardContent className="pt-10 pb-8 text-center space-y-6">
            <div className="flex justify-center">{iconMap[state]}</div>
            <h1 className="text-2xl font-bold text-foreground">{titleMap[state]}</h1>
            <p className="text-muted-foreground">{message}</p>

            {(state === 'success' || state === 'reactivated' || state === 'already_verified') && (
              <Button onClick={() => navigate('/dashboard')} className="tech-button w-full">
                Go to Dashboard
              </Button>
            )}

            {state === 'expired' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Your verification link has expired. Please sign in and request a new one.
                </p>
                <Button onClick={() => navigate('/auth?tab=signin')} variant="outline" className="w-full">
                  Sign In
                </Button>
              </div>
            )}

            {state === 'error' && (
              <Button onClick={() => navigate('/')} variant="outline" className="w-full">
                Go Home
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </SiteLayout>
  );
}
