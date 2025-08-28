import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, ArrowLeft, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PasswordResetModal = ({ isOpen, onClose }: PasswordResetModalProps) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });
    
    if (error) {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setEmailSent(true);
      toast({
        title: "Reset Email Sent",
        description: "Please check your email for password reset instructions."
      });
    }
    setLoading(false);
  };

  const handleClose = () => {
    setEmail('');
    setEmailSent(false);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md tech-border">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Reset Password
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            {emailSent 
              ? "We've sent you a password reset link"
              : "Enter your email to receive password reset instructions"
            }
          </DialogDescription>
        </DialogHeader>

        {emailSent ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                We've sent a password reset link to <strong>{email}</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Didn't receive the email? Check your spam folder or try again.
              </p>
            </div>
            <div className="space-y-2">
              <Button onClick={() => setEmailSent(false)} variant="outline" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Try Different Email
              </Button>
              <Button onClick={handleClose} className="w-full tech-button">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-foreground">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Button 
                type="submit" 
                className="w-full tech-button"
                disabled={loading || !email}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Reset Link...
                  </>
                ) : (
                  'Send Reset Link'
                )}
              </Button>
              
              <Button 
                type="button" 
                variant="outline"
                onClick={handleClose}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};