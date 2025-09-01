import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Shield, Users, Globe, Code, Lightbulb, Target, Heart } from "lucide-react";

export default function Web3Manifesto() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-12 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Web3 Manifesto
          </h1>
          <p className="text-xl text-muted-foreground max-w-4xl mx-auto">
            Our vision for a decentralized future where financial tools are transparent, accessible, 
            and owned by the community they serve.
          </p>
        </div>

        {/* Core Beliefs */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <h2 className="text-3xl font-bold text-primary">Our Core Beliefs</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-3">
                  <Shield className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">Transparency First</h3>
                  <p className="text-sm text-muted-foreground">
                    Every fee, every algorithm, every decision should be open and auditable
                  </p>
                </div>
                <div className="space-y-3">
                  <Users className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">Community Ownership</h3>
                  <p className="text-sm text-muted-foreground">
                    Tools should be built by and for the community, not corporate shareholders
                  </p>
                </div>
                <div className="space-y-3">
                  <Globe className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">Global Access</h3>
                  <p className="text-sm text-muted-foreground">
                    Financial tools should be accessible to anyone, anywhere, regardless of background
                  </p>
                </div>
                <div className="space-y-3">
                  <Code className="h-8 w-8 text-primary mx-auto" />
                  <h3 className="font-bold">Open Source</h3>
                  <p className="text-sm text-muted-foreground">
                    Code should be verifiable, auditable, and improvable by the community
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The Problem */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              The Problem We're Solving
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-lg text-muted-foreground">
              Traditional finance has failed us. Centralized institutions extract value through opaque fees, 
              arbitrary restrictions, and gatekeeping that excludes billions from financial opportunities.
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-red-600">Traditional Finance Problems</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Hidden fees and surprise charges</li>
                  <li>• Geographic and economic barriers</li>
                  <li>• Opaque algorithms and black-box systems</li>
                  <li>• Centralized control and censorship</li>
                  <li>• Extractive business models</li>
                  <li>• Limited innovation and competition</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-semibold text-green-600">Web3 Solutions</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Transparent, auditable smart contracts</li>
                  <li>• Global access with just an internet connection</li>
                  <li>• Open-source, verifiable algorithms</li>
                  <li>• Decentralized governance and ownership</li>
                  <li>• Community-driven value creation</li>
                  <li>• Permissionless innovation</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Our Vision */}
        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-6 w-6 text-primary" />
                Our Vision
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                We envision a world where sophisticated financial tools are no longer the privilege of the wealthy elite. 
                Where trading strategies, risk management, and market analysis are democratized through transparent, 
                community-owned platforms.
              </p>
              <p className="text-muted-foreground">
                In this future, a small trader in rural Africa has access to the same advanced tools as a Wall Street firm. 
                Fees are determined by mathematical algorithms, not corporate greed. Communities pool resources to achieve 
                goals that benefit everyone, not just shareholders.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-6 w-6 text-primary" />
                Our Commitment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                BlackBox Farm is more than a trading platform—it's a statement about how financial tools should work. 
                We commit to radical transparency, community governance, and sustainable economics that benefit users, 
                not extractive middlemen.
              </p>
              <p className="text-muted-foreground">
                Every line of code we write, every algorithm we deploy, and every decision we make is guided by the 
                principle that technology should empower individuals and communities, not concentrate power in the hands of few.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Principles in Action */}
        <Card>
          <CardHeader>
            <CardTitle>How We Live These Principles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">Transparency</Badge>
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Open-source smart contracts</li>
                  <li>• Real-time fee calculations</li>
                  <li>• Public audit reports</li>
                  <li>• Transparent governance proposals</li>
                </ul>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">Community</Badge>
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Community-driven campaigns</li>
                  <li>• Shared risk and reward pools</li>
                  <li>• Collaborative governance</li>
                  <li>• Open development process</li>
                </ul>
              </div>
              
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Badge variant="outline">Accessibility</Badge>
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• No minimum account balances</li>
                  <li>• Pay-per-use pricing model</li>
                  <li>• Multi-language support</li>
                  <li>• Educational resources</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* The Future */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <h2 className="text-3xl font-bold text-primary">Building the Future Together</h2>
              <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
                Web3 isn't just about technology—it's about reimagining how we organize economic activity. 
                It's about creating systems that serve humanity, not the other way around.
              </p>
              <div className="grid md:grid-cols-3 gap-6 mt-8">
                <div className="space-y-2">
                  <Zap className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="font-bold">Innovation</h3>
                  <p className="text-sm text-muted-foreground">
                    Constant improvement through community feedback and open development
                  </p>
                </div>
                <div className="space-y-2">
                  <Users className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="font-bold">Collaboration</h3>
                  <p className="text-sm text-muted-foreground">
                    Building tools that enable cooperation and shared success
                  </p>
                </div>
                <div className="space-y-2">
                  <Globe className="h-12 w-12 text-primary mx-auto" />
                  <h3 className="font-bold">Global Impact</h3>
                  <p className="text-sm text-muted-foreground">
                    Creating economic opportunities for everyone, everywhere
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Join the Movement</h2>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              The future of finance isn't built by corporations in boardrooms—it's built by communities of 
              builders, traders, and visionaries working together toward a common goal.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Badge variant="secondary" className="text-sm px-3 py-1">#DeFi</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#Web3</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#OpenSource</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#CommunityOwned</Badge>
              <Badge variant="secondary" className="text-sm px-3 py-1">#Transparency</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}