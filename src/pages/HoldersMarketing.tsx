import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  Shield, 
  TrendingUp, 
  Users, 
  Target, 
  Zap, 
  Eye,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Megaphone,
  DollarSign,
  MousePointerClick
} from "lucide-react";
import { FarmBanner } from "@/components/FarmBanner";
import { SolPriceDisplay } from "@/components/SolPriceDisplay";

export default function HoldersMarketing() {
  const navigate = useNavigate();

  const features = [
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Token Health Score",
      description: "Instant risk assessment based on LP percentage, holder concentration, and distribution patterns"
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "Holder Distribution Analysis",
      description: "See exactly who holds what - whales, KOLs, developers, or real community members"
    },
    {
      icon: <TrendingUp className="w-6 h-6" />,
      title: "First Buyer P&L Tracking",
      description: "Know if early buyers are profitable or dumping - a key indicator of token health"
    },
    {
      icon: <Target className="w-6 h-6" />,
      title: "Developer Wallet Detection",
      description: "Automatically flags creator wallets and tracks their reputation across all tokens"
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Real-Time Whale Movements",
      description: "Get alerts when large holders buy, sell, or accumulate positions"
    },
    {
      icon: <Eye className="w-6 h-6" />,
      title: "Smart Money Tracker",
      description: "Identify wallets with consistent winning trades and follow their moves"
    }
  ];

  const benefits = [
    {
      icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
      text: "Avoid rug pulls by detecting suspicious LP and holder patterns"
    },
    {
      icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
      text: "Identify tokens with healthy distribution before they pump"
    },
    {
      icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
      text: "Track developer reputation to avoid serial scammers"
    },
    {
      icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
      text: "Follow smart money wallets and KOLs automatically"
    },
    {
      icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
      text: "See holder retention and diamond hands analysis"
    },
    {
      icon: <CheckCircle2 className="w-5 h-5 text-green-400" />,
      text: "Get launchpad detection (Pump.fun, Raydium, etc.)"
    }
  ];

  const adBenefits = [
    {
      icon: <MousePointerClick className="w-5 h-5" />,
      title: "High-Intent Traffic",
      description: "Users actively researching tokens before buying - ready to engage"
    },
    {
      icon: <Target className="w-5 h-5" />,
      title: "Perfect Audience",
      description: "Solana traders, degens, and investors making buy decisions"
    },
    {
      icon: <BarChart3 className="w-5 h-5" />,
      title: "Premium Placements",
      description: "Top-of-page visibility on every holder analysis report"
    },
    {
      icon: <DollarSign className="w-5 h-5" />,
      title: "Performance Tracking",
      description: "Track impressions, clicks, and conversions on your campaigns"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="mx-auto py-8 px-4 max-w-6xl space-y-12">
        
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <div className="flex items-center justify-center gap-3">
            <img 
              src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
              alt="BlackBox Cube Logo" 
              className="w-16 h-16"
            />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              Holders Analysis
            </h1>
          </div>
          <p className="text-2xl text-muted-foreground max-w-3xl mx-auto">
            Your essential pre-buy research tool for Solana tokens
          </p>
          <SolPriceDisplay size="lg" className="justify-center" />
        </div>

        {/* Why Use This */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <AlertTriangle className="w-8 h-8 text-primary" />
              Why You Need This Before Every Buy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-lg text-muted-foreground">
              The Solana memecoin market moves fast. In seconds, you need to know:
            </p>
            <ul className="space-y-3 text-base">
              <li className="flex items-start gap-3">
                <span className="text-2xl">🚨</span>
                <span><strong>Is this a rug?</strong> - LP locked? Developer wallet suspicious? Top holders concentrated?</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-2xl">💎</span>
                <span><strong>Are holders diamond hands?</strong> - Retention rate high? Early buyers still holding?</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-2xl">🐋</span>
                <span><strong>Who else is buying?</strong> - Smart money in? KOLs accumulating? Whales entering?</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-2xl">🎯</span>
                <span><strong>Developer track record?</strong> - First token or serial launcher? Past successes or rugs?</span>
              </li>
            </ul>
            <p className="text-lg font-semibold text-primary pt-4">
              This tool gives you all these answers in under 10 seconds.
            </p>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div>
          <h2 className="text-3xl font-bold mb-6 text-center">What You Get</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, index) => (
              <Card key={index} className="border-border/50 hover:border-primary/50 transition-colors">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {feature.icon}
                    </div>
                    <h3 className="font-semibold">{feature.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Benefits */}
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-2xl">Make Smarter Decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-start gap-3">
                  {benefit.icon}
                  <span className="text-foreground">{benefit.text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Why Visit Daily */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Zap className="w-6 h-6 text-yellow-400" />
              Why Check Every Token Here First
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Successful traders use this tool for every single buy decision:
            </p>
            <div className="space-y-3 pl-4 border-l-2 border-primary/30">
              <p>✅ <strong>Pre-buy verification</strong> - Paste token address, get instant risk score</p>
              <p>✅ <strong>Whale watching</strong> - See what smart money is accumulating today</p>
              <p>✅ <strong>Developer tracking</strong> - Avoid known scammers, follow trusted creators</p>
              <p>✅ <strong>Holder retention</strong> - Find tokens with loyal communities before breakout</p>
              <p>✅ <strong>First buyer P&L</strong> - If early buyers are profitable, token has momentum</p>
            </div>
            <Button 
              onClick={() => navigate("/holders")}
              size="lg"
              className="w-full mt-4"
            >
              Analyze a Token Now →
            </Button>
          </CardContent>
        </Card>

        {/* Advertiser Section */}
        <div className="space-y-6 pt-8 border-t-2 border-border">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Why Advertise Here?
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Get in front of active traders at the exact moment they're making buy decisions
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {adBenefits.map((benefit, index) => (
              <Card key={index} className="border-primary/20 hover:border-primary/40 transition-colors">
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
                      {benefit.icon}
                    </div>
                    <h3 className="text-lg font-semibold">{benefit.title}</h3>
                  </div>
                  <p className="text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-4">
                <Megaphone className="w-12 h-12 text-primary flex-shrink-0" />
                <div className="space-y-2">
                  <h3 className="text-xl font-bold">Perfect For:</h3>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>🚀 New token launches looking for visibility</li>
                    <li>📊 Trading tools and platforms</li>
                    <li>💼 Web3 services targeting active traders</li>
                    <li>🎯 Projects wanting to reach decision-makers at point of purchase</li>
                  </ul>
                </div>
              </div>
              <div className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  <strong>Prime banner placement</strong> appears on every holder analysis page.
                  Users spend 30-60 seconds reviewing reports - perfect for brand awareness and clicks.
                </p>
                <Button 
                  onClick={() => navigate("/adverts")}
                  variant="default"
                  size="lg"
                  className="w-full"
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  Get Banner Space →
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center space-y-4 pb-8">
          <Button 
            onClick={() => navigate("/holders")}
            size="lg"
            className="text-lg px-8 py-6"
          >
            Start Analyzing Tokens Now
          </Button>
          <p className="text-sm text-muted-foreground">
            Free to use • Real-time data • No registration required
          </p>
        </div>
      </div>
    </div>
  );
}
