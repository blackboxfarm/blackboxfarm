import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSecureAuth } from '@/hooks/useSecureAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, AlertTriangle, Eye, EyeOff, Shield } from 'lucide-react';
import { PasswordResetModal } from './PasswordResetModal';
import { EmailVerificationModal } from './EmailVerificationModal';
import { InputValidator, ValidationRules } from '@/components/security/InputValidator';
import { OAuthButtons } from './OAuthButtons';
import { ReferralSourceSelect, getReferralSourceValue } from './ReferralSourceSelect';
import { useSignupProtection } from '@/hooks/useSignupProtection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

interface SecureAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'signin' | 'signup';
}

export const SecureAuthModal = ({ isOpen, onClose, defaultTab = 'signin' }: SecureAuthModalProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [referralSource, setReferralSource] = useState('');
  const [referralSourceOther, setReferralSourceOther] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [pending2FAEmail, setPending2FAEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const { honeypotProps, isBot, isTooFast, formRenderedAt } = useSignupProtection();
  
  const { signIn, signUp, isRateLimited, rateLimitState } = useSecureAuth();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    if (!turnstileToken) {
      toast({ title: 'Please complete the verification', variant: 'destructive' });
      return;
    }

    setLoading(true);
    
    try {
      // Check if user has 2FA enabled before signing in
      const { data: tfaCheck } = await supabase.functions.invoke('check-2fa-requirement', {
        body: { email }
      });

      if (tfaCheck?.requires2FA) {
        // Don't sign in yet — show 2FA prompt
        setPending2FAEmail(email);
        setShow2FA(true);
        setLoading(false);
        return;
      }
    } catch {
      // If check fails, proceed with normal login
    }

    const { error } = await signIn(email, password);
    
    if (error) {
      toast({
        title: "Sign In Failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Welcome back!",
        description: "You've been signed in successfully."
      });
      onClose();
    }
    setLoading(false);
  };

  const handle2FAVerify = async () => {
    if (totpCode.length !== 6) return;
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-2fa-login', {
        body: { email: pending2FAEmail, totpCode, rememberDevice: true }
      });
      
      if (fnError || !data?.success) {
        toast({
          title: "2FA Verification Failed",
          description: data?.error || fnError?.message || "Invalid code. Please try again.",
          variant: "destructive"
        });
        setTotpCode('');
        setLoading(false);
        return;
      }

      // 2FA passed — now sign in normally
      const { error } = await signIn(pending2FAEmail, password);
      if (error) {
        toast({ title: "Sign In Failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Welcome back!", description: "2FA verified successfully." });
        setShow2FA(false);
        setTotpCode('');
        onClose();
      }
    } catch (err: any) {
      toast({ title: "2FA Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Bot detection: honeypot field filled
    if (isBot()) {
      toast({ title: "Account Created!", description: "Please check your email to verify your account." });
      return;
    }
    
    // Bot detection: form completed too fast (< 3 seconds)
    if (isTooFast()) {
      toast({ title: "Please slow down", description: "Please take a moment to fill out the form carefully.", variant: "destructive" });
      return;
    }
    
    if (!email || !password || password !== confirmPassword || !referralSource) {
      toast({
        title: "Sign Up Failed",
        description: "Please check your email and password fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    const refValue = getReferralSourceValue(referralSource, referralSourceOther);
    const { error } = await signUp(email, password);
    
    if (error) {
      toast({
        title: "Sign Up Failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      // Save referral source
      if (refValue) {
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase.from('profiles').update({ referral_source: refValue } as any).eq('id', newUser.id);
        }
      }
      setVerificationEmail(email);
      setShowEmailVerification(true);
      toast({
        title: "Account Created!",
        description: "Please check your email to verify your account."
      });
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleForgotPassword = () => {
    setShowPasswordReset(true);
  };

  const getPasswordValidationRules = () => [
    ValidationRules.password.minLength(4), // Reduced for testing
    ValidationRules.password.maxLength(128)
    // Note: Uppercase, lowercase, and number requirements removed for easier testing
  ];

  const getRateLimitMessage = () => {
    if (isRateLimited && rateLimitState.blockUntil) {
      const timeLeft = Math.ceil((rateLimitState.blockUntil - Date.now()) / 60000);
      return `Too many failed attempts. Please try again in ${timeLeft} minutes.`;
    }
    return null;
  };

  const rateLimitMessage = getRateLimitMessage();

  return (
    <>
    {/* 2FA Verification Dialog */}
    <Dialog open={show2FA} onOpenChange={(open) => { if (!open) { setShow2FA(false); setTotpCode(''); } }}>
      <DialogContent className="sm:max-w-sm tech-border">
        <DialogHeader>
          <DialogTitle className="text-center flex items-center justify-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Two-Factor Authentication
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground text-center">
            Enter the 6-digit code from your authenticator app.
          </p>
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode}>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button
            className="w-full"
            onClick={handle2FAVerify}
            disabled={loading || totpCode.length !== 6}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Verify
          </Button>
          <button
            className="text-xs text-muted-foreground hover:underline w-full text-center"
            onClick={() => { setShow2FA(false); setTotpCode(''); }}
          >
            Cancel and go back
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md tech-border">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Secure BlackBox Access
          </DialogTitle>
        </DialogHeader>

        {rateLimitMessage && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{rateLimitMessage}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'signin' | 'signup')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Create Account</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-4">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email" className="text-foreground">Email</Label>
                <InputValidator
                  value={email}
                  rules={[ValidationRules.email, ValidationRules.required]}
                  showValidation={!!email}
                >
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signin-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="pl-10"
                      required
                      disabled={isRateLimited}
                    />
                  </div>
                </InputValidator>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signin-password" className="text-foreground">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="signin-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    required
                    disabled={isRateLimited}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full tech-button"
                disabled={loading || !email || !password || isRateLimited}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing In...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <OAuthButtons disabled={isRateLimited} />

              <Button 
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleForgotPassword}
                className="w-full text-muted-foreground hover:text-primary"
                disabled={isRateLimited}
              >
                Forgot your password?
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4">
            <form onSubmit={handleSignUp} className="space-y-4">
              {/* Honeypot field - invisible to humans, bots fill it */}
              <input {...honeypotProps} type="text" aria-hidden="true" />
              <div className="space-y-2">
                <Label htmlFor="signup-email" className="text-foreground">Email</Label>
                <InputValidator
                  value={email}
                  rules={[ValidationRules.email, ValidationRules.required]}
                  showValidation={!!email}
                >
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="pl-10"
                      required
                      disabled={isRateLimited}
                    />
                  </div>
                </InputValidator>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="signup-password" className="text-foreground">Password</Label>
                <InputValidator
                  value={password}
                  rules={getPasswordValidationRules()}
                  showValidation={!!password}
                >
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      required
                      minLength={4}
                      disabled={isRateLimited}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </InputValidator>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-foreground">Confirm Password</Label>
                <InputValidator
                  value={confirmPassword}
                  rules={[
                    ValidationRules.required,
                    {
                      test: (value: string) => value === password,
                      message: 'Passwords must match',
                      severity: 'error' as const
                    }
                  ]}
                  showValidation={!!confirmPassword}
                >
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      required
                      disabled={isRateLimited}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </InputValidator>
              </div>

              <ReferralSourceSelect
                value={referralSource}
                otherValue={referralSourceOther}
                onChange={setReferralSource}
                onOtherChange={setReferralSourceOther}
                disabled={loading || isRateLimited}
              />

              <Button 
                type="submit" 
                className="w-full tech-button"
                disabled={loading || !email || !password || password !== confirmPassword || isRateLimited || !referralSource || (referralSource === 'other' && !referralSourceOther.trim())}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                'Create Account'
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <OAuthButtons disabled={isRateLimited} />
            </form>
          </TabsContent>
        </Tabs>

        <PasswordResetModal 
          isOpen={showPasswordReset}
          onClose={() => setShowPasswordReset(false)}
        />

        <EmailVerificationModal 
          isOpen={showEmailVerification}
          onClose={() => setShowEmailVerification(false)}
          email={verificationEmail}
        />
      </DialogContent>
    </Dialog>
    </>
  );
};