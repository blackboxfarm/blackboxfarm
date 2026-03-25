import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Zap, Shield, Users, Globe, Code, Eye, Target, Skull, 
  Search, Brain, Network, AlertTriangle, Crosshair, Flame
} from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";

export default function Web3Manifesto() {
  return (
    <SiteLayout>
      <div className="container max-w-5xl mx-auto px-4 py-12 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary via-accent to-primary/60 bg-clip-text text-transparent">
            The BlackBox Manifesto
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            The blockchain promised transparency. The market delivered deception.<br/>
            <span className="text-primary font-semibold">We're here to tip the balance.</span>
          </p>
        </div>

        {/* Opening Statement */}
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
          <CardContent className="p-8 md:p-12">
            <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
              <p>
                Every day, thousands of new tokens launch on Solana. Most are noise. Some are outright scams — 
                bundled supply, recycled Telegram channels, insider wallets extracting liquidity from unsuspecting buyers.
              </p>
              <p>
                The tools to see through this exist. The data is on-chain. But it's buried under layers of complexity 
                that only insiders, bots, and bad actors have the resources to navigate.
              </p>
              <p className="text-foreground font-medium text-xl">
                BlackBox Farm exists to change that equation.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Core Beliefs */}
        <Card className="border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-8">
              <h2 className="text-3xl font-bold text-primary">What We Believe</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-3">
                  <Eye className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">On-Chain Truth</h3>
                  <p className="text-sm text-muted-foreground">
                    The blockchain doesn't lie. Wallets tell stories. We read them so you don't get played.
                  </p>
                </div>
                <div className="space-y-3">
                  <Shield className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">Protect the Trader</h3>
                  <p className="text-sm text-muted-foreground">
                    Retail deserves the same intelligence that insiders use against them.
                  </p>
                </div>
                <div className="space-y-3">
                  <Brain className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">AI-Augmented Intel</h3>
                  <p className="text-sm text-muted-foreground">
                    Machine learning surfaces patterns humans miss — bundle detection, wallet clustering, reputation scoring.
                  </p>
                </div>
                <div className="space-y-3">
                  <Crosshair className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">Track the Devs</h3>
                  <p className="text-sm text-muted-foreground">
                    Good actors get recognized. Bad actors get exposed. Wallet families don't hide forever.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The Problem */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Skull className="h-6 w-6 text-destructive" />
              The Battlefield
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-lg text-muted-foreground">
              Solana's memecoin ecosystem is the most active — and most predatory — market in crypto. 
              Here's what traders face every single day:
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4 p-6 rounded-lg bg-destructive/5 border border-destructive/20">
                <h3 className="text-xl font-semibold text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" /> The Threats
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>🔴 Bundled supply — devs hiding 40%+ in insider wallets</li>
                  <li>🔴 Recycled Telegram channels used across rug after rug</li>
                  <li>🔴 Fake "organic" volume from coordinated wallet clusters</li>
                  <li>🔴 Dev wallet families that rebrand and re-deploy weekly</li>
                  <li>🔴 Paid CTO takeovers disguising insider dumps</li>
                  <li>🔴 Marketing shills pumping tokens they've already loaded</li>
                </ul>
              </div>
              <div className="space-y-4 p-6 rounded-lg bg-primary/5 border border-primary/20">
                <h3 className="text-xl font-semibold text-primary flex items-center gap-2">
                  <Search className="h-5 w-5" /> The BlackBox Answer
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>🟢 AI holder analysis — instant insider/bundle detection</li>
                  <li>🟢 Developer reputation profiling across token launches</li>
                  <li>🟢 Wallet family graph mapping with relationship scoring</li>
                  <li>🟢 AllStar registry tracking proven developers</li>
                  <li>🟢 Real-time mint alerts when known devs launch again</li>
                  <li>🟢 Telegram & marketing channel fingerprinting</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* How It Works */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="border-primary/20">
            <CardContent className="p-6 space-y-4 text-center">
              <Network className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-xl font-bold">The Oracle</h3>
              <p className="text-sm text-muted-foreground">
                Our intelligence engine monitors DexScreener's Top 200, Telegram channels, and on-chain activity 24/7. 
                Every trending token gets profiled. Every creator wallet gets traced.
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardContent className="p-6 space-y-4 text-center">
              <Flame className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-xl font-bold">The Reputation Mesh</h3>
              <p className="text-sm text-muted-foreground">
                Developers can't hide behind fresh wallets. Our graph engine maps wallet families, 
                tracks funding paths, and builds persistent reputation profiles across their entire history.
              </p>
            </CardContent>
          </Card>
          <Card className="border-primary/20">
            <CardContent className="p-6 space-y-4 text-center">
              <Zap className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-xl font-bold">The Signal</h3>
              <p className="text-sm text-muted-foreground">
                When a proven developer launches a new token, you know within minutes — not hours. 
                When a known bad actor resurfaces, you're warned before the chart dumps.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* What We're Building */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-6 w-6 text-primary" />
              The Stack
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Intelligence Layer</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• <strong>AI Holder Analysis</strong> — GPT-powered bundle and insider detection</li>
                  <li>• <strong>Wallet Family Engine</strong> — Graph-based wallet clustering and relationship scoring</li>
                  <li>• <strong>AllStar Registry</strong> — Tracking proven devs with tiered rankings (T1-T8)</li>
                  <li>• <strong>Mint Alert System</strong> — Real-time notifications when tracked devs launch</li>
                  <li>• <strong>Bubble Maps</strong> — Visual holder distribution analysis</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Discovery Layer</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• <strong>Dex Top 200 Scanner</strong> — Auto-ingests trending tokens every 30 minutes</li>
                  <li>• <strong>Telegram Monitor</strong> — Scrapes alpha channels for early signals</li>
                  <li>• <strong>@HoldersIntel Bot</strong> — Automated X posts with holder analysis</li>
                  <li>• <strong>Developer Profiles</strong> — Full launch history and reputation scoring</li>
                  <li>• <strong>Funnel Attribution</strong> — Track which discovery sources yield the best alpha</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The Vision */}
        <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
          <CardContent className="p-8 md:p-12">
            <div className="text-center space-y-6">
              <h2 className="text-3xl font-bold text-primary">The Endgame</h2>
              <p className="text-lg text-muted-foreground max-w-4xl mx-auto leading-relaxed">
                We're not building another charting tool. We're building an intelligence network that makes 
                the Solana memecoin market legible — where good developers are rewarded with attention, 
                bad actors are mapped and tracked, and every trader has access to the same on-chain truth.
              </p>
              <div className="grid md:grid-cols-3 gap-6 mt-8">
                <div className="space-y-2">
                  <Target className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="font-bold">Precision</h3>
                  <p className="text-sm text-muted-foreground">
                    Know who built the token, what they've done before, and who's really holding.
                  </p>
                </div>
                <div className="space-y-2">
                  <Users className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="font-bold">Community Intel</h3>
                  <p className="text-sm text-muted-foreground">
                    Open analysis reports. Shared intelligence. The crowd protects the crowd.
                  </p>
                </div>
                <div className="space-y-2">
                  <Globe className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="font-bold">Always On</h3>
                  <p className="text-sm text-muted-foreground">
                    24/7 automated monitoring. Bots that never sleep. Alerts that arrive before the chart moves.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <Card>
          <CardContent className="p-8 text-center space-y-6">
            <h2 className="text-2xl font-bold">Putting the Needle in the Haystack</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Follow the wallets. Track the devs. Know the truth before you ape.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Badge variant="secondary" className="text-sm px-3 py-1">#FollowTheWallets</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#OnChainTruth</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#BlackBoxFarm</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#SolanaIntel</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#DYOR</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </SiteLayout>
  );
}
