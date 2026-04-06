import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { PricingTable } from "@/components/premium/PricingTable";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserTier } from "@/hooks/useUserTier";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Sparkles, Mail, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function Onboarding() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { checkSubscription } = useUserTier();
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationVerified, setVerificationVerified] = useState(false);

  // Send verification email on first load for new users
  useEffect(() => {
    if (!user) return;

    const sendVerification = async () => {
      // Check if already verified
      const { data: existing } = await supabase
        .from('email_verifications')
        .select('id, verified_at')
        .eq('user_id', user.id)
        .not('verified_at', 'is', null)
        .limit(1);

      if (existing && existing.length > 0) {
        setVerificationVerified(true);
        return;
      }

      // Check if already sent
      const { data: sent } = await supabase
        .from('email_verifications')
        .select('id')
        .eq('user_id', user.id)
        .eq('verification_type', 'signup')
        .limit(1);

      if (sent && sent.length > 0) {
        setVerificationSent(true);
        return;
      }

      // Send verification email
      try {
        await supabase.functions.invoke('send-verification-email', {
          body: { type: 'signup' },
        });
        setVerificationSent(true);
      } catch {
        // Silent — don't block onboarding
      }
    };

    sendVerification();
  }, [user]);

  // Handle Stripe return
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription activated! Welcome aboard 🎉');
      checkSubscription();
      localStorage.setItem('bbx_onboarding_done', '1');
      setSearchParams({}, { replace: true });

      // Mark any pending checkout intents as completed
      if (user) {
        supabase.from('checkout_intents')
          .update({ status: 'completed', completed_at: new Date().toISOString() } as any)
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .then(() => {});
      }

      // Give webhook a moment to process, then redirect
      setTimeout(() => navigate('/dashboard', { replace: true }), 2000);
    } else if (searchParams.get('canceled') === 'true') {
      toast.info('Checkout canceled. No charges were made.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const handleSkipFree = () => {
    localStorage.setItem('bbx_onboarding_done', '1');
    navigate('/dashboard', { replace: true });
  };

  return (
    <SiteLayout>
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        {/* Email Verification Banner */}
        {user && !verificationVerified && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-start gap-4">
            <div className="shrink-0 mt-0.5">
              <Mail className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-foreground text-sm">
                📧 Check Your Email — Verify Within 48 Hours
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                We've sent a verification link to <span className="font-medium text-foreground">{user.email}</span>. 
                Please click the link in the email to verify your account. 
                Accounts that don't verify within 48 hours will be temporarily suspended.
              </p>
            </div>
            {verificationSent && (
              <span className="text-xs text-primary font-medium whitespace-nowrap mt-1">✓ Email Sent</span>
            )}
          </div>
        )}

        {user && verificationVerified && (
          <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-primary" />
            <span className="text-sm text-foreground font-medium">Email verified ✓</span>
          </div>
        )}

        {/* Welcome header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium">
            <Sparkles className="w-4 h-4" />
            {user ? 'Welcome to BlackBox Farm' : 'Join BlackBox Farm'}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {user 
              ? 'Pick the tier that fits your trading style. You can always upgrade later from your dashboard.'
              : 'Create a free account and pick a plan — or just sign up and upgrade later.'}
          </p>
        </div>

        {/* Pricing Table — handles auth modal for anon users automatically */}
        <PricingTable />

        {/* Skip / Continue Free */}
        <div className="text-center space-y-3 pb-8">
          {user ? (
            <Button 
              variant="ghost" 
              size="lg"
              onClick={handleSkipFree}
              className="text-muted-foreground hover:text-foreground gap-2"
            >
              Continue with Free plan
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Click any plan above to create your account and get started.
            </p>
          )}
        </div>
      </div>
    </SiteLayout>
  );
}
