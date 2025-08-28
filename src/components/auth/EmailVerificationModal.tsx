import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, RefreshCw, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export const EmailVerificationModal = ({ isOpen, onClose, email }: EmailVerificationModalProps) => {
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleResendVerification = async () => {
    if (!email) return;

    setLoading(true);
    
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/`
      }
    });
    
    if (error) {
      toast({
        title: "Failed to Resend",
        description: error.message,
        variant: "destructive"
      });
    } else {
      setEmailSent(true);
      toast({
        title: "Verification Email Sent",
        description: "Please check your email for the verification link."
      });
    }
    setLoading(false);
  };

  const handleClose = () => {
    setEmailSent(false);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md tech-border">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Verify Your Email
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Check your email to complete account setup
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            {emailSent ? (
              <Check className="w-8 h-8 text-primary" />
            ) : (
              <Mail className="w-8 h-8 text-primary" />
            )}
          </div>
          
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              We've sent a verification link to:
            </p>
            <p className="font-medium text-foreground">{email}</p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-left">
            <h4 className="font-medium text-sm mb-2">Next steps:</h4>
            <ol className="text-xs text-muted-foreground space-y-1">
              <li>1. Check your email inbox</li>
              <li>2. Click the verification link</li>
              <li>3. Return here to sign in</li>
            </ol>
          </div>

          <div className="space-y-2">
            <Button 
              onClick={handleResendVerification}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>
            
            <Button onClick={handleClose} className="w-full tech-button">
              I'll Check My Email
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Didn't receive the email? Check your spam folder.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};