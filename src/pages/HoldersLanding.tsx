import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FarmBanner } from "@/components/FarmBanner";
import { 
  Users, 
  Shield, 
  TrendingUp, 
  AlertTriangle, 
  BarChart3, 
  Search, 
  CheckCircle2, 
  ArrowRight,
  Target,
  Eye,
  Coins,
  PieChart
} from "lucide-react";

export default function HoldersLanding() {
  const features = [
    {
      icon: Search,
      title: "Instant Token Lookup",
      description: "Paste any Solana token address and get a comprehensive holder analysis in seconds."
    },
    {
      icon: PieChart,
      title: "Distribution Breakdown",
      description: "See exactly how tokens are distributed across whale, large, medium, small, and dust wallets."
    },
    {
      icon: AlertTriangle,
      title: "Risk Detection",
      description: "Identify potential rug pull risks, concentrated holdings, and suspicious wallet patterns."
    },
    {
      icon: Target,
      title: "Functional Holders Count",
      description: "Filter out dust wallets and LP to see the true number of meaningful token holders."
    },
    {
      icon: Eye,
      title: "LP Wallet Identification",
      description: "Automatically detect and exclude liquidity pool wallets from holder analysis."
    },
    {
      icon: Coins,
      title: "Real-time Price Data",
      description: "See current token price, market cap, and liquidity alongside holder data."
    }
  ];

  const benefits = [
    "Avoid buying tokens with heavily concentrated ownership",
    "Identify tokens with healthy distribution patterns",
    "Spot potential insider wallets before they dump",
    "Verify dev wallet holdings and vesting patterns",
    "Compare holder health across multiple tokens",
    "Make data-driven trading decisions"
  ];

  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Top CTA */}
        <div className="text-center mb-8">
          <Link to="/holders">
            <Button size="lg" className="gap-2 text-lg px-8 py-6">
              <Users className="h-5 w-5" />
              Launch Holders Analysis Tool
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Users className="h-12 w-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">Holders Analysis</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            The essential due diligence tool for Solana traders. Analyze token holder distribution, 
            detect risks, and make informed decisions before every buy.
          </p>
        </div>

        {/* Why Use This Tool */}
        <Card className="mb-12 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Why You Need This Before Every Buy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  The Problem
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Token charts can look bullish while insiders wait to dump</li>
                  <li>• "1000+ holders" often includes 800+ dust wallets</li>
                  <li>• Dev wallets can be hidden across multiple addresses</li>
                  <li>• Without analysis, you're trading blind</li>
                </ul>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green-500" />
                  The Solution
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• See true holder distribution in seconds</li>
                  <li>• Identify whale concentrations instantly</li>
                  <li>• Spot suspicious patterns before it's too late</li>
                  <li>• Make decisions based on data, not hope</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-8">Powerful Analysis Features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <feature.icon className="h-5 w-5 text-primary" />
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Benefits Section */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-green-500" />
              Make Smarter Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span className="text-muted-foreground">{benefit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* How It Works */}
        <Card className="mb-12 bg-muted/30">
          <CardHeader>
            <CardTitle className="text-2xl text-center">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm md:text-base">
              <Badge variant="default" className="px-3 py-1">Paste Token Address</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="secondary" className="px-3 py-1">1. Quick Snapshot</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="secondary" className="px-3 py-1">2. Report Summary</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="secondary" className="px-3 py-1">3. Functional Holders</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="secondary" className="px-3 py-1">4. Distribution Integrity</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="default" className="px-3 py-1">Share!</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Bottom CTA */}
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Trade Smarter?</h2>
          <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
            Stop trading blind. Analyze any Solana token's holder distribution in seconds and make informed decisions.
          </p>
          <Link to="/holders">
            <Button size="lg" className="gap-2 text-lg px-8 py-6">
              <Users className="h-5 w-5" />
              Start Analyzing Now
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
