import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Zap, Users, Rocket, Eye, Brain, BarChart3, ExternalLink } from "lucide-react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Link } from "react-router-dom";

export default function AboutUs() {
  return (
    <SiteLayout>
      <div className="container mx-auto py-6 space-y-8 max-w-5xl px-4">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            About BlackBox Farm
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            AI-powered on-chain intelligence for the Solana ecosystem. We analyze holders, trace wallets, 
            detect scammers, and surface the signals that matter — so you can trade with clarity.
          </p>
        </div>

        {/* Mission Statement */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-primary mb-4">Our Mission</h2>
              <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
                To bring radical transparency to on-chain markets through AI-driven holder analysis, 
                wallet network tracing, and identity verification — making the hidden connections in 
                crypto visible, readable, and actionable for everyone.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Core Values */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-6 w-6 text-primary" />
                Transparency First
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Every token tells a story through its holder data, wallet networks, and social connections. 
                We decode that story using AI analysis, reputation databases, and recursive wallet tracing — 
                then present it clearly so you can make informed decisions.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Scam Protection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Our growing bad-actor database cross-references every wallet against known rug-pullers, 
                blacklisted developers, and recycled identities. We resolve mutable usernames to immutable IDs — 
                scammers can't hide by changing handles.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                Built for the Community
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                From free holder breakdowns to our public Telegram channel broadcasting the hottest tokens on-chain, 
                we believe intelligence should be accessible. Our tiered model ensures every trader — from casual to 
                professional — gets the depth they need.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Our Story */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-6 w-6 text-primary" />
              Our Story
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              BlackBox Farm started with a simple question: <em>why is it so hard to know who's really holding a token?</em> 
              The Solana ecosystem moves fast — new tokens launch every minute, developers recycle wallets, and scammers 
              change identities overnight. Existing tools showed surface-level data but missed the deeper patterns.
            </p>
            <p className="text-muted-foreground">
              We built Holders Intel to solve that. Starting with basic holder distribution analysis, we expanded into 
              AI-powered risk scoring, recursive KYC root tracing, social identity mapping, and an interactive Bubble Map 
              that visualizes the entire network around a token — from developer wallets to X community admins to exchange 
              funding roots.
            </p>
            <p className="text-muted-foreground">
              Today, BlackBox Farm delivers intelligence across web, Telegram, and API — helping traders, researchers, and 
              communities make better decisions with data that goes deeper than anyone else in the space.
            </p>
          </CardContent>
        </Card>

        {/* What We Do */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              What We Build
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Holders Intel (Web + API)</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• AI-powered holder distribution analysis</li>
                  <li>• Risk scoring with stability and concentration metrics</li>
                  <li>• Dev wallet tracing and reputation cross-reference</li>
                  <li>• KYC root discovery via recursive wallet scanning</li>
                  <li>• Recycled identity detection across X and Telegram</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Telegram Bot + Channel</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• @holdersintel_bot — private query bot for $TICKER lookups</li>
                  <li>• @HoldersIntel — public feed of trending tokens on-chain</li>
                  <li>• Tiered access from free /quick to full Pro suite</li>
                  <li>• Group chat integration with abbreviated intel</li>
                  <li>• Real-time alerts and alpha drops</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Bubble Map</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Interactive network graph of token connections</li>
                  <li>• On-chain, social, and web branches</li>
                  <li>• Spider scan and deep-trace capabilities</li>
                  <li>• Bad actor database overlay</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Public Intelligence</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li>• Automated X posts via @holdersintel</li>
                  <li>• Dual broadcast to Telegram public channel</li>
                  <li>• Community-driven scam alerts</li>
                  <li>• Open analytics for market transparency</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Parent Company */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold text-foreground">A Product of System Reset</h2>
              <p className="text-muted-foreground max-w-3xl mx-auto">
                BlackBox Farm is developed and operated by{' '}
                <a 
                  href="https://systemreset.ca" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  System Reset <ExternalLink className="w-3 h-3" />
                </a>
                , our parent company. All billing, subscriptions, and payment processing are handled 
                through System Reset via Stripe. For billing inquiries or corporate matters, 
                visit{' '}
                <a 
                  href="https://systemreset.ca" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  systemreset.ca
                </a>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center space-y-4 pb-8">
          <h2 className="text-2xl font-bold text-foreground">Ready to see what's hiding in the data?</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/holders">
              <span className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors">
                <BarChart3 className="w-4 h-4" /> Try Holders Analysis
              </span>
            </Link>
            <Link to="/subscriptions">
              <span className="inline-flex items-center gap-2 px-6 py-3 rounded-md border border-border text-foreground font-medium hover:bg-accent transition-colors">
                View Plans
              </span>
            </Link>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}
