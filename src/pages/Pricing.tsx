import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PricingTable } from '@/components/premium/PricingTable';
import { SocialIcon } from '@/components/token/SocialIcon';
import { ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useUserTier } from '@/hooks/useUserTier';

export default function Pricing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { checkSubscription } = useUserTier();

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription activated! Welcome aboard 🎉');
      checkSubscription();
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('canceled') === 'true') {
      toast.info('Checkout canceled. No charges were made.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Holders Intel Plans
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            From free token analysis to full AI-powered intel. Pick the plan that fits your trading style.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-blue-400">
            <SocialIcon platform="twitter" className="w-4 h-4" />
            <a
              href="https://x.com/holdersintel"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline inline-flex items-center gap-1"
            >
              X Subscribers save on every paid plan
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Pricing Table */}
        <PricingTable />

        {/* Billing notice */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
          <span>
            Billing powered by Stripe under{' '}
            <a
              href="https://systemreset.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground"
            >
              System Reset
            </a>
            , our parent company.
          </span>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto space-y-4 text-sm">
          <h2 className="text-xl font-semibold text-center">Frequently Asked Questions</h2>
          <div className="space-y-3">
            <div>
              <p className="font-medium">How does the X Subscriber discount work?</p>
              <p className="text-muted-foreground">
                Subscribe to @holdersintel on X, then link your X handle in Settings. 
                Verified subscribers get reduced pricing on all paid tiers.
              </p>
            </div>
            <div>
              <p className="font-medium">Can I cancel anytime?</p>
              <p className="text-muted-foreground">
                Yes. All subscriptions are monthly with no long-term commitment.
              </p>
            </div>
            <div>
              <p className="font-medium">What's included in the free tier?</p>
              <p className="text-muted-foreground">
                Basic holder analysis, health grade, and an AI quick summary — no account required.
                Sign up free for the full AI interpretation panel and whale warnings.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
