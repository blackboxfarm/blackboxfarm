import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SiteLayout } from '@/components/layout/SiteLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, AlertTriangle, KeyRound, Mail, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ActionState = 'loading' | 'success' | 'expired' | 'used' | 'error';

interface ActionResult {
  action_type?: string;
  success?: boolean;
  message?: string;
  reg_code?: string;
  is_used?: boolean;
  is_linked?: boolean;
  error?: string;
  expired?: boolean;
  used?: boolean;
}

export default function TokenAction() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [state, setState] = useState<ActionState>('loading');
  const [result, setResult] = useState<ActionResult>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = searchParams.get('t');
    if (!token) {
      setState('error');
      setResult({ message: 'No action token provided.' });
      return;
    }

    const resolve = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-action-token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ token }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          if (data.expired) {
            setState('expired');
          } else if (data.used) {
            setState('used');
          } else {
            setState('error');
          }
          setResult(data);
          return;
        }

        setState('success');
        setResult(data);
      } catch {
        setState('error');
        setResult({ message: 'Something went wrong. Please try again.' });
      }
    };

    resolve();
  }, [searchParams]);

  const handleCopy = async () => {
    if (result.reg_code) {
      await navigator.clipboard.writeText(result.reg_code);
      setCopied(true);
      toast({ title: 'Copied!', description: 'Registration code copied to clipboard.' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const iconMap: Record<ActionState, React.ReactNode> = {
    loading: <Loader2 className="w-16 h-16 text-primary animate-spin" />,
    success: <CheckCircle className="w-16 h-16 text-primary" />,
    expired: <AlertTriangle className="w-16 h-16 text-muted-foreground" />,
    used: <AlertTriangle className="w-16 h-16 text-muted-foreground" />,
    error: <XCircle className="w-16 h-16 text-destructive" />,
  };

  const titleMap: Record<ActionState, string> = {
    loading: 'Processing...',
    success: result.action_type === 'view_reg_code' ? 'Your Registration Code' : 'Done! ✅',
    expired: 'Link Expired ⏰',
    used: 'Already Used',
    error: 'Something Went Wrong',
  };

  return (
    <SiteLayout>
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full tech-border">
          <CardContent className="pt-10 pb-8 text-center space-y-6">
            <div className="flex justify-center">{iconMap[state]}</div>
            <h1 className="text-2xl font-bold text-foreground">{titleMap[state]}</h1>

            {state === 'success' && result.action_type === 'view_reg_code' && result.reg_code && (
              <div className="space-y-4">
                <p className="text-muted-foreground">Use this code in a Telegram DM with <strong>@holdersintel_bot</strong>:</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-2xl font-mono tracking-widest bg-muted px-6 py-3 rounded-lg text-foreground">
                    {result.reg_code}
                  </code>
                  <Button variant="ghost" size="icon" onClick={handleCopy}>
                    {copied ? <Check className="w-5 h-5 text-primary" /> : <Copy className="w-5 h-5" />}
                  </Button>
                </div>
                {result.is_linked && (
                  <p className="text-sm text-primary flex items-center justify-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Already linked to Telegram
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Send <code>/link {result.reg_code}</code> to @holdersintel_bot in a private DM.
                </p>
              </div>
            )}

            {state === 'success' && result.action_type === 'resend_verification' && (
              <div className="space-y-3">
                <Mail className="w-10 h-10 text-primary mx-auto" />
                <p className="text-muted-foreground">{result.message}</p>
                <p className="text-sm text-muted-foreground">Check your inbox and spam folder.</p>
              </div>
            )}

            {state === 'success' && result.action_type === 'password_reset' && (
              <div className="space-y-3">
                <KeyRound className="w-10 h-10 text-primary mx-auto" />
                <p className="text-muted-foreground">{result.message}</p>
                <p className="text-sm text-muted-foreground">Check your inbox for the password reset link.</p>
              </div>
            )}

            {(state === 'expired' || state === 'used') && (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  {result.error || 'This link is no longer valid.'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Ask @holdersintel_bot for a new link — just say what you need!
                </p>
              </div>
            )}

            {state === 'error' && (
              <div className="space-y-3">
                <p className="text-muted-foreground">{result.error || result.message}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SiteLayout>
  );
}
