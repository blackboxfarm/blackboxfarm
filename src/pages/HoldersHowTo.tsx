import React from "react";
import { Link } from "react-router-dom";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search, BarChart3, Shield, AlertTriangle, TrendingUp, Users,
  Crown, ExternalLink, Share2, ArrowRight, CheckCircle2, Copy,
  Zap, Target, Eye
} from "lucide-react";

export default function HoldersHowTo() {
  return (
    <SiteLayout>
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-4">
          <Badge variant="outline" className="text-primary border-primary/30">
            <BarChart3 className="w-3 h-3 mr-1" /> Getting Started Guide
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            How to Use <span className="text-primary">Token Holder Analysis</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Paste any Solana token address and instantly get a full health report — holder distribution, 
            whale activity, risk flags, and AI-powered insights.
          </p>
        </div>

        {/* Step 1: Getting Started */}
        <Card className="border-primary/20">
          <CardContent className="p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">1</div>
              <h2 className="text-xl font-bold text-foreground">Paste a Token Address</h2>
            </div>
            <p className="text-muted-foreground">
              Go to the <Link to="/holders" className="text-primary hover:underline font-semibold">Holder Analysis page</Link> and 
              paste any Solana token's contract address (mint address) into the search bar. You can find this on 
              any DEX screener, Birdeye, or Solscan. Hit <strong>Analyze</strong> and the report generates in seconds.
            </p>
            <div className="bg-muted/50 rounded-lg p-4 font-mono text-sm text-muted-foreground flex items-center gap-2">
              <Copy className="w-4 h-4 text-primary flex-shrink-0" />
              <span>Example: So11111111111111111111111111111111111111112</span>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Reading the Report */}
        <Card>
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">2</div>
              <h2 className="text-xl font-bold text-foreground">Reading Your Report</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Shield className="w-4 h-4 text-green-500" /> Health Score
                </div>
                <p className="text-sm text-muted-foreground">
                  A letter grade (A+ to F) based on holder distribution, concentration risk, and whale behavior. 
                  <strong className="text-foreground"> A/B = healthy.</strong> C = caution. D/F = high risk.
                </p>
              </div>

              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Users className="w-4 h-4 text-blue-400" /> Holder Distribution
                </div>
                <p className="text-sm text-muted-foreground">
                  See how tokens are spread across holders — from whales (top 10) down to micro-holders. 
                  Healthy tokens have wide distribution, not concentrated in a few wallets.
                </p>
              </div>

              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" /> Risk Flags
                </div>
                <p className="text-sm text-muted-foreground">
                  Automatic warnings for dangerous patterns — single wallet dominance, suspicious clustering, 
                  rapid accumulation, or potential rug pull indicators.
                </p>
              </div>

              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <TrendingUp className="w-4 h-4 text-emerald-400" /> AI Insights
                </div>
                <p className="text-sm text-muted-foreground">
                  AI-powered interpretation of the data — momentum signals, accumulation/distribution patterns, 
                  and plain-English risk assessment. <Badge variant="outline" className="text-xs">Pro</Badge>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: What to Look For */}
        <Card>
          <CardContent className="p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">3</div>
              <h2 className="text-xl font-bold text-foreground">What to Look For</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Green flags — Healthy token</p>
                  <p className="text-sm text-muted-foreground">Wide holder distribution, no single wallet &gt;5%, growing unique holders, active trading volume across many wallets.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Yellow flags — Proceed with caution</p>
                  <p className="text-sm text-muted-foreground">Top 10 holders control &gt;40%, declining holder count, large recent accumulation by few wallets.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Red flags — High risk</p>
                  <p className="text-sm text-muted-foreground">Single wallet &gt;20% supply, dev wallet still loaded, token unlocks imminent, zero organic trading activity.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Why It's Great */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 md:p-8 space-y-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" /> Why Traders Use This
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="text-center space-y-2">
                <Target className="w-8 h-8 text-primary mx-auto" />
                <p className="font-semibold text-foreground text-sm">Avoid Rug Pulls</p>
                <p className="text-xs text-muted-foreground">Spot dangerous concentration before you buy in.</p>
              </div>
              <div className="text-center space-y-2">
                <Eye className="w-8 h-8 text-primary mx-auto" />
                <p className="font-semibold text-foreground text-sm">Track Smart Money</p>
                <p className="text-xs text-muted-foreground">See whale movements and accumulation patterns.</p>
              </div>
              <div className="text-center space-y-2">
                <TrendingUp className="w-8 h-8 text-primary mx-auto" />
                <p className="font-semibold text-foreground text-sm">Find Early Gems</p>
                <p className="text-xs text-muted-foreground">Healthy distribution + growing holders = opportunity.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Share CTA */}
        <Card>
          <CardContent className="p-6 md:p-8 text-center space-y-4">
            <Share2 className="w-10 h-10 text-primary mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Share with Your Community</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Know a degen who's been rugged one too many times? Share BlackBox with them. 
              The more traders using real data, the harder it is for scammers to operate.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/holders">
                <Button className="gap-2">
                  <BarChart3 className="w-4 h-4" /> Try It Now
                </Button>
              </Link>
              <a href="https://x.com/intent/tweet?text=Check%20out%20BlackBox%20Farm%20for%20Solana%20token%20holder%20analysis%20%E2%80%94%20https%3A%2F%2Fblackbox.farm%2Fholders" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="w-4 h-4" /> Share on X
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Pro Upgrade */}
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="p-6 md:p-8 text-center space-y-4">
            <Crown className="w-10 h-10 text-purple-400 mx-auto" />
            <h2 className="text-xl font-bold text-foreground">Unlock the Full Picture</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Free accounts get the basics. Pro unlocks AI interpretation, stability scores, 
              top 25 holder details, first 25 buyer tracking, wallet flagging, and unlimited reports.
            </p>
            <Link to="/pricing">
              <Button variant="outline" className="gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                <Crown className="w-4 h-4" /> View Pro Plans <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </SiteLayout>
  );
}
