import React from "react";
import { Link } from "react-router-dom";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Network, Search, MousePointer2, Maximize2, Crown, ExternalLink,
  ArrowRight, Fingerprint, Globe, Users, Compass, Eye, Zap,
  Share2, ChevronRight
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserTier } from "@/hooks/useUserTier";

export default function BubblesHowTo() {
  return (
    <SiteLayout>
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
        {/* Hero */}
        <div className="text-center space-y-4">
          <Badge variant="outline" className="text-primary border-primary/30">
            <Network className="w-3 h-3 mr-1" /> Getting Started Guide
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            How to Use the <span className="text-primary">Bubble Map</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Visualize wallet networks, developer genealogy, and social connections 
            for any Solana token in an interactive graph.
          </p>
        </div>

        {/* Step 1: Getting Started */}
        <Card className="border-primary/20">
          <CardContent className="p-6 md:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">1</div>
              <h2 className="text-xl font-bold text-foreground">Enter a Token Address</h2>
            </div>
            <p className="text-muted-foreground">
              Go to the <Link to="/bubblemap" className="text-primary hover:underline font-semibold">Bubble Map</Link> and 
              paste any Solana token mint address into the search bar. The system will automatically discover the 
              token metadata, developer wallet, and begin building the network graph.
            </p>
            <p className="text-sm text-muted-foreground">
              The <strong className="text-foreground">token bubble</strong> appears as the large center node with a thick white border. 
              Connected nodes represent the developer wallet, linked social accounts, and related tokens.
            </p>
          </CardContent>
        </Card>

        {/* Step 2: Understanding the View */}
        <Card>
          <CardContent className="p-6 md:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">2</div>
              <h2 className="text-xl font-bold text-foreground">Understanding the Graph</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <div className="w-4 h-4 rounded-full border-2 border-white bg-primary" /> Token Node
                </div>
                <p className="text-sm text-muted-foreground">
                  The main token — thick white border, center of the graph. All connections radiate from here.
                </p>
              </div>

              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Fingerprint className="w-4 h-4 text-orange-400" /> Developer Wallet
                </div>
                <p className="text-sm text-muted-foreground">
                  The wallet that created the token. Connected to other tokens the same dev has launched.
                </p>
              </div>

              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Globe className="w-4 h-4 text-blue-400" /> Social Links
                </div>
                <p className="text-sm text-muted-foreground">
                  X/Twitter accounts, websites, and Telegram groups linked to each token — not the dev wallet directly.
                </p>
              </div>

              <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Users className="w-4 h-4 text-purple-400" /> X Community
                </div>
                <p className="text-sm text-muted-foreground">
                  Map followers and connections from X/Twitter to see social overlap between token communities.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Action Buttons */}
        <Card>
          <CardContent className="p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">3</div>
              <h2 className="text-xl font-bold text-foreground">Power Actions</h2>
            </div>
            <p className="text-muted-foreground">
              The action buttons in the top-left corner of the map let you dig deeper:
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Fingerprint className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Find KYC Root</p>
                  <p className="text-sm text-muted-foreground">Traces funding back through wallet hops to find the original source wallet — follow the money trail.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Search className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Find All Tokens</p>
                  <p className="text-sm text-muted-foreground">Discovers every token the developer wallet has created — see their full launch history and track record.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Network className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Deep Spider</p>
                  <p className="text-sm text-muted-foreground">Expands the network by spidering through connected wallets and their tokens — reveals hidden connections.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <Users className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Map X Community</p>
                  <p className="text-sm text-muted-foreground">Pulls in social connections from X/Twitter to overlay community data onto the wallet graph.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Step 4: Managing the View */}
        <Card>
          <CardContent className="p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">4</div>
              <h2 className="text-xl font-bold text-foreground">Managing the View</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <MousePointer2 className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Click &amp; drag</strong> nodes to reposition them. The physics engine will rearrange the rest.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <MousePointer2 className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Double-click</strong> a node to focus on it and see its connections highlighted.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Maximize2 className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Scroll to zoom</strong> in and out. Use the <strong className="text-foreground">Solar Min</strong> button to reset the layout with the token as center.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Compass className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Shakey-Shake</strong> resets the physics simulation — useful after adding new nodes to re-organize the layout.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* What to Look For */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-6 md:p-8 space-y-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" /> What to Look For
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Experienced devs</strong> — A developer with multiple successful past launches (visible as satellite token nodes) is a positive signal.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Repeat rug patterns</strong> — If the dev's past tokens all died quickly, the current token might follow the same pattern.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Supply concentration flags</strong> — Red overlays (&ge;5% supply) and yellow overlays (&ge;1%) show dangerous concentration in the holder view.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">Social footprint</strong> — Legitimate tokens have real social presence. No X account or website is a red flag.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/bubblemap">
            <Button size="lg" className="gap-2">
              <Network className="w-4 h-4" /> Open Bubble Map
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
              <Crown className="w-4 h-4" /> Upgrade for Unlimited Access
            </Button>
          </Link>
        </div>
      </div>
    </SiteLayout>
  );
}
