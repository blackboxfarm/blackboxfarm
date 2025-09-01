import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Zap, Users, Target, Rocket, Globe } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function AboutUs() {
  return (
    <div className="min-h-screen tech-gradient relative overflow-hidden">
      <div className="container mx-auto py-12 space-y-12 relative z-10">
        <PageHeader />
        
        {/* Hero Section */}
        <div className="text-center space-y-6">
          <h2 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            About BlackBox Farm
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Revolutionizing DeFi trading with transparent, affordable, and secure automated solutions for the Solana ecosystem.
          </p>
        </div>

        {/* Mission Statement */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-primary mb-4">Our Mission</h2>
              <p className="text-lg text-muted-foreground max-w-4xl mx-auto">
                To democratize advanced trading strategies by providing enterprise-grade automation tools at a fraction of traditional costs, 
                making sophisticated DeFi trading accessible to everyone from individual traders to institutional players.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Core Values */}
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Security First
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Enterprise-grade security with 2FA, phone verification, and military-grade encryption. 
                Your funds and data are protected by the same standards used by financial institutions.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Transparency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                No hidden fees, no surprise markups. Our smart pricing model automatically chooses the most 
                cost-effective approach for your trading volume, saving you up to 90% compared to competitors.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                Community Driven
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Built by traders, for traders. Our community-powered campaigns allow users to pool resources 
                and share costs while maintaining individual control and transparency.
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
              BlackBox Farm was born from frustration with the existing DeFi trading landscape. Traditional trading bots 
              charged exorbitant fees, lacked transparency, and often failed to deliver on their promises. We saw traders 
              paying 1-2% in fees while receiving subpar service and limited functionality.
            </p>
            <p className="text-muted-foreground">
              Our founders, experienced in both traditional finance and DeFi, decided to build a better solution. 
              By leveraging cutting-edge batch processing techniques (inspired by successful models like Smithii) 
              and implementing honest, usage-based pricing, we've created a platform that truly serves traders' interests.
            </p>
            <p className="text-muted-foreground">
              Today, BlackBox Farm serves thousands of traders, from DeFi newcomers to seasoned professionals, 
              helping them execute complex strategies with unprecedented cost efficiency and security.
            </p>
          </CardContent>
        </Card>

        {/* Technology Advantages */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-6 w-6 text-primary" />
              Technology That Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Smart Pricing Engine</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Dynamic fee calculation based on actual usage</li>
                  <li>• Batch processing for volume operations</li>
                  <li>• Micro-transaction optimization for small trades</li>
                  <li>• Real-time market analysis and adjustment</li>
                </ul>
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">Advanced Security</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• End-to-end encryption for all sensitive data</li>
                  <li>• Multi-factor authentication and device verification</li>
                  <li>• Decentralized architecture with no single point of failure</li>
                  <li>• Regular security audits and penetration testing</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Values */}
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <h2 className="text-3xl font-bold text-primary">Why Choose BlackBox Farm?</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <Badge variant="secondary" className="text-sm">Cost Effective</Badge>
                  <p className="text-sm text-muted-foreground">
                    Save up to 90% on trading fees with our intelligent pricing model
                  </p>
                </div>
                <div className="space-y-2">
                  <Badge variant="secondary" className="text-sm">Enterprise Ready</Badge>
                  <p className="text-sm text-muted-foreground">
                    Security and reliability standards that institutional clients trust
                  </p>
                </div>
                <div className="space-y-2">
                  <Badge variant="secondary" className="text-sm">24/7 Support</Badge>
                  <p className="text-sm text-muted-foreground">
                    Round-the-clock monitoring and priority support for all users
                  </p>
                </div>
                <div className="space-y-2">
                  <Badge variant="secondary" className="text-sm">Open Source</Badge>
                  <p className="text-sm text-muted-foreground">
                    Transparent, auditable code that you can trust and verify
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Global Impact */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              Global Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-8 text-center">
              <div>
                <h3 className="text-3xl font-bold text-primary">$50M+</h3>
                <p className="text-muted-foreground">Total Volume Processed</p>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-primary">10K+</h3>
                <p className="text-muted-foreground">Active Traders</p>
              </div>
              <div>
                <h3 className="text-3xl font-bold text-primary">99.9%</h3>
                <p className="text-muted-foreground">Uptime Guarantee</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}