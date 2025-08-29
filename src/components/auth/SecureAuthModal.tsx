import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSecureAuth } from '@/hooks/useSecureAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, AlertTriangle } from 'lucide-react';
import { PasswordResetModal } from './PasswordResetModal';
import { EmailVerificationModal } from './EmailVerificationModal';
import { InputValidator, ValidationRules } from '@/components/security/InputValidator';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  
  const { signIn, signUp, isRateLimited, rateLimitState } = useSecureAuth();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
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

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || password !== confirmPassword) {
      toast({
        title: "Sign Up Failed",
        description: "Please check your email and password fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password);
    
    if (error) {
      toast({
        title: "Sign Up Failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
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
    ValidationRules.password.minLength(6),
    ValidationRules.password.maxLength(128),
    ValidationRules.password.hasUppercase,
    ValidationRules.password.hasLowercase,
    ValidationRules.password.hasNumber
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
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    required
                    disabled={isRateLimited}
                  />
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
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10"
                      required
                      minLength={6}
                      disabled={isRateLimited}
                    />
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
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10"
                      required
                      disabled={isRateLimited}
                    />
                  </div>
                </InputValidator>
              </div>

              <Button 
                type="submit" 
                className="w-full tech-button"
                disabled={loading || !email || !password || password !== confirmPassword || isRateLimited}
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
  );
};