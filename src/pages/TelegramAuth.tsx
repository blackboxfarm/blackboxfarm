import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle, AlertCircle, ArrowLeft, MessageCircle } from 'lucide-react';

type TokenState = 'loading' | 'valid' | 'expired' | 'used' | 'error';
type AuthStep = 'form' | 'linking' | 'success' | 'error';

export default function TelegramAuth() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('t');

  const [tokenState, setTokenState] = useState<TokenState>('loading');
  const [actionType, setActionType] = useState<'tg_signup' | 'tg_signin' | null>(null);
  const [telegramUserId, setTelegramUserId] = useState<string>('');
  const [telegramUsername, setTelegramUsername] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authStep, setAuthStep] = useState<AuthStep>('form');
  const [authError, setAuthError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate the token on mount
  useEffect(() => {
    if (!token) {
      setTokenState('error');
      setErrorMsg('No token provided. Please use the link from the Telegram bot.');
      return;
    }

    (async () => {
      try {
        const res = await supabase.functions.invoke('resolve-action-token', {
          body: { token },
        });

        if (res.error) {
          setTokenState('error');
          setErrorMsg('Failed to validate token.');
          return;
        }

        const data = res.data;

        if (data.expired) {
          setTokenState('expired');
          setErrorMsg('This link has expired. Go back to the bot and tap the button again.');
          return;
        }

        if (data.used) {
          setTokenState('used');
          setErrorMsg('This link has already been used.');
          return;
        }

        if (data.error) {
          setTokenState('error');
          setErrorMsg(data.error);
          return;
        }

        if (data.action_type === 'tg_signup' || data.action_type === 'tg_signin') {
          setActionType(data.action_type);
          setTelegramUserId(data.telegram_user_id || '');
          setTelegramUsername(data.telegram_username || '');
          setTokenState('valid');
        } else {
          setTokenState('error');
          setErrorMsg('Invalid token type.');
        }
      } catch (e) {
        setTokenState('error');
        setErrorMsg('Failed to validate token.');
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsSubmitting(true);

    try {
      let userId: string;

      if (actionType === 'tg_signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });

        if (error) {
          setAuthError(error.message);
          setIsSubmitting(false);
          return;
        }

        userId = data.user?.id || '';
        if (!userId) {
          setAuthError('Account creation failed. Please try again.');
          setIsSubmitting(false);
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthError(error.message);
          setIsSubmitting(false);
          return;
        }

        userId = data.user?.id || '';
      }

      // Now link Telegram
      setAuthStep('linking');

      const linkRes = await supabase.functions.invoke('tg-link-after-auth', {
        body: {
          user_id: userId,
          telegram_user_id: telegramUserId,
          telegram_username: telegramUsername,
          otp_token: token,
        },
      });

      if (linkRes.error || linkRes.data?.error) {
        setAuthStep('error');
        setAuthError(linkRes.data?.error || 'Failed to link Telegram account.');
        setIsSubmitting(false);
        return;
      }

      setAuthStep('success');
    } catch (e: any) {
      setAuthError(e.message || 'Something went wrong.');
      setAuthStep('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (tokenState === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Validating your link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error/expired/used states
  if (tokenState !== 'valid') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-bold text-foreground mb-2">
              {tokenState === 'expired' ? 'Link Expired' : tokenState === 'used' ? 'Already Used' : 'Invalid Link'}
            </h2>
            <p className="text-muted-foreground mb-6">{errorMsg}</p>
            <p className="text-sm text-muted-foreground">
              Go back to <span className="font-semibold text-primary">@holdersintel_bot</span> on Telegram and tap /start again.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (authStep === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
            <h2 className="text-2xl font-bold text-foreground mb-2">You're All Set! 🎉</h2>
            <p className="text-muted-foreground mb-2">
              {actionType === 'tg_signup'
                ? 'Account created and Telegram linked!'
                : 'Telegram account linked successfully!'}
            </p>
            {telegramUsername && (
              <p className="text-sm text-muted-foreground mb-6">
                Linked to <span className="font-mono text-primary">@{telegramUsername}</span>
              </p>
            )}
            <div className="flex flex-col gap-3 w-full">
              <Button
                asChild
                className="w-full bg-[#0088cc] hover:bg-[#0077b5] text-white"
              >
                <a href="https://t.me/holdersintel_bot">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Return to Telegram Bot
                </a>
              </Button>
              <Button variant="outline" asChild className="w-full">
                <a href="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go to Dashboard
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Linking state
  if (authStep === 'linking') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="flex flex-col items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Linking your Telegram account...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Auth form
  const isSignUp = actionType === 'tg_signup';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {isSignUp ? '🆕 Create Account' : '🔑 Log In & Link'}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isSignUp
              ? 'Create your BlackBox Farm account and auto-link Telegram.'
              : 'Log in to link your Telegram account.'}
          </p>
          {telegramUsername && (
            <p className="text-xs text-muted-foreground">
              Linking to Telegram: <span className="font-mono text-primary">@{telegramUsername}</span>
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignUp ? 'Choose a strong password' : 'Your password'}
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </div>

            {authError && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
                {authError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSignUp ? 'Creating Account...' : 'Logging In...'}
                </>
              ) : (
                isSignUp ? 'Create Account & Link Telegram' : 'Log In & Link Telegram'
              )}
            </Button>
          </form>

          <p className="text-xs text-center text-muted-foreground mt-6">
            ⏱ This link expires in 2 minutes.
            {isSignUp && (
              <> By creating an account, you agree to our{' '}
                <a href="/terms" className="text-primary hover:underline">Terms</a> and{' '}
                <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
