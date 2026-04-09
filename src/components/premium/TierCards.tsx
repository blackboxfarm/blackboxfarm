import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  CheckCircle2, XCircle, Star, Crown, Zap, Users, ArrowRight, Loader2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_TIERS } from "@/config/stripeTiers";
import { AuthModal } from "@/components/auth/AuthModal";
import { toast } from "sonner";

interface TierFeature {
  name: string;
  included: boolean | string;
}

interface Tier {
  name: string;
  icon: React.ReactNode;
  monthlyPrice: string;
  yearlyPrice?: string;
  yearlySavings?: string;
  description: string;
  color: string;
  badge?: string;
  highlight?: boolean;
  hasBillingToggle?: boolean;
  cta: { label: string; action: string; to: string };
  features: TierFeature[];
}

const TIERS: Tier[] = [
  {
    name: "Free",
    icon: <Zap className="w-5 h-5" />,
    monthlyPrice: "Free",
    description: "Explore the basics. No account needed.",
    color: "border-muted-foreground/30",
    cta: { label: "Try Free Analysis", action: "navigate", to: "/holders" },
    features: [
      { name: "Basic Holder Breakdown", included: true },
      { name: "Top 25 Holders Table", included: true },
      { name: "Liquidity & Supply Stats", included: true },
      { name: "Stability Score", included: true },
      { name: "Telegram /quick command", included: true },
      { name: "AI Analysis", included: false },
      { name: "Bubble Map", included: false },
      { name: "Wallet Deep Scan", included: false },
    ],
  },
  {
    name: "Signed In",
    icon: <Users className="w-5 h-5" />,
    monthlyPrice: "Free",
    description: "Create an account to unlock more depth.",
    color: "border-primary/30",
    cta: { label: "Sign Up Free", action: "auth", to: "" },
    features: [
      { name: "Everything in Free", included: true },
      { name: "Extended Analysis Panel", included: true },
      { name: "Security Alerts & Flags", included: true },
      { name: "Reputation Cross-Reference", included: true },
      { name: "Telegram /holders, /ca", included: true },
      { name: "AI Narrative Reports", included: false },
      { name: "Bubble Map (limited)", included: "partial" },
      { name: "Oracle Deep Scan", included: false },
    ],
  },
  {
    name: "X Subscriber",
    icon: <Star className="w-5 h-5" />,
    monthlyPrice: "$4.99/mo",
    yearlyPrice: "$38.99/yr",
    yearlySavings: "Save 19%",
    hasBillingToggle: true,
    description: "Subscribe via X for premium intel.",
    color: "border-primary/50",
    cta: { label: "Subscribe on X", action: "external", to: "https://x.com/holdersintel" },
    features: [
      { name: "Everything in Signed In", included: true },
      { name: "AI Analysis & Risk Scores", included: true },
      { name: "Telegram /risk, /ai", included: true },
      { name: "Bubble Map (good access)", included: true },
      { name: "Dev Wallet Tracing", included: true },
      { name: "KYC Root Discovery", included: "partial" },
      { name: "Full Oracle Network", included: false },
      { name: "API Access", included: false },
    ],
  },
  {
    name: "Pro",
    icon: <Crown className="w-5 h-5" />,
    monthlyPrice: "$9.99/mo",
    yearlyPrice: "$89.99/yr",
    yearlySavings: "Save 25%",
    hasBillingToggle: true,
    description: "Full power. Every tool. Every signal.",
    color: "border-primary",
    highlight: true,
    cta: { label: "Upgrade to Pro", action: "checkout", to: "" },
    features: [
      { name: "Everything in X Subscriber", included: true },
      { name: "Full AI Narrative Reports", included: true },
      { name: "Bubble Map (unlimited)", included: true },
      { name: "Oracle Deep + Spider Scan", included: true },
      { name: "KYC Root Network Mapping", included: true },
      { name: "Recycled Identity Detection", included: true },
      { name: "Full Telegram Bot Suite", included: true },
      { name: "Priority API Access", included: true },
    ],
  },
];

function FeatureCheck({ included }: { included: boolean | string }) {
  if (included === true) return <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />;
  if (included === "partial") return <Star className="w-4 h-4 text-muted-foreground shrink-0" />;
  return <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />;
}

export function TierCards() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authIntent, setAuthIntent] = useState<"checkout" | "signup">("signup");
  const pendingCheckout = useRef(false);
  const [isYearly, setIsYearly] = useState(false);
  const pendingYearly = useRef(false);

  const handleProCheckout = async (yearly?: boolean) => {
    const useYearly = yearly ?? isYearly;
    if (!user) {
      setAuthIntent("checkout");
      pendingCheckout.current = true;
      pendingYearly.current = useYearly;
      setShowAuthModal(true);
      return;
    }
    setCheckoutLoading(true);
    try {
      const priceId = useYearly
        ? STRIPE_TIERS.pro.yearly_price_id
        : STRIPE_TIERS.pro.price_id;
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleSignupClick = () => {
    if (!user) {
      setAuthIntent("signup");
      setShowAuthModal(true);
    }
  };

  // Auto-trigger checkout after sign-in
  useEffect(() => {
    if (user && pendingCheckout.current) {
      pendingCheckout.current = false;
      setShowAuthModal(false);
      handleProCheckout(pendingYearly.current);
    }
  }, [user]);

  const handleCtaClick = (tier: Tier) => {
    if (tier.cta.action === "checkout") {
      handleProCheckout();
    } else if (tier.cta.action === "external") {
      window.open(tier.cta.to, "_blank");
    } else if (tier.cta.action === "auth") {
      handleSignupClick();
    } else {
      navigate(tier.cta.to);
    }
  };

  return (
    <>
      {/* Billing toggle */}
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
            Monthly
          </span>
          <Switch
            checked={isYearly}
            onCheckedChange={setIsYearly}
            className="data-[state=checked]:bg-primary"
          />
          <span className={`text-sm font-medium ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
            Billed yearly
          </span>
          {isYearly && (
            <Badge variant="outline" className="text-primary border-primary text-[10px] ml-1">
              Save up to 25%
            </Badge>
          )}
        </div>
        {isYearly && (
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 text-xs">
            <span className="text-primary font-bold">◎</span>
            <span className="text-muted-foreground">
              Pay with <strong className="text-foreground">Solana</strong> — 1 SOL/yr (~$84) via Telegram.{' '}
              <a
                href="https://t.me/holdersintel_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                DM @holdersintel_bot → /payment
              </a>
            </span>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {TIERS.map((tier) => {
          const showYearlyPrice = isYearly && tier.hasBillingToggle;
          const displayPrice = showYearlyPrice ? tier.yearlyPrice! : tier.monthlyPrice;

          return (
            <Card
              key={tier.name}
              className={`relative bg-card ${tier.color} ${tier.highlight ? "ring-1 ring-primary shadow-glow" : ""} transition-all hover:border-primary/40`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-[10px] font-bold uppercase">
                    Most Popular
                  </Badge>
                </div>
              )}
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="text-primary">{tier.icon}</div>
                  <h3 className="font-bold text-foreground">{tier.name}</h3>
                </div>

                <div className="min-h-[48px]">
                  <span className="text-2xl font-black text-foreground">{displayPrice}</span>
                  {showYearlyPrice && tier.yearlySavings && (
                    <span className="ml-2 text-xs font-semibold text-primary">{tier.yearlySavings}</span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">{tier.description}</p>

                <ul className="space-y-2 pt-2">
                  {tier.features.map((f) => (
                    <li key={f.name} className="flex items-center gap-2 text-sm">
                      <FeatureCheck included={f.included} />
                      <span className={f.included ? "text-foreground/90" : "text-muted-foreground/50"}>
                        {f.name}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="pt-2">
                  {tier.cta.action === "checkout" ? (
                    <Button
                      variant="default"
                      className="w-full gap-2"
                      disabled={checkoutLoading}
                      onClick={() => handleCtaClick(tier)}
                    >
                      {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : tier.cta.label}
                      {!checkoutLoading && <ArrowRight className="w-4 h-4" />}
                    </Button>
                  ) : (
                    <Button
                      variant={tier.highlight ? "default" : "outline"}
                      className="w-full gap-2"
                      onClick={() => handleCtaClick(tier)}
                    >
                      {tier.cta.label} <ArrowRight className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        defaultTab="signup"
      />
    </>
  );
}
