import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Shield, Zap, Users, Settings, Code, Wallet, TrendingUp, Lock, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const Demo = () => {
  const [activeDemo, setActiveDemo] = useState("campaign");
  const [showSecrets, setShowSecrets] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-primary/5">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
            BlackBox Platform Demo
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Experience how easy it is to set up campaigns, build trading strategies, and manage community wallets
          </p>
        </div>

        <Tabs value={activeDemo} onValueChange={setActiveDemo} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="campaign" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Campaign Setup
            </TabsTrigger>
            <TabsTrigger value="code" className="flex items-center gap-2">
              <Code className="w-4 h-4" />
              Strategy Builder
            </TabsTrigger>
            <TabsTrigger value="wallet" className="flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Wallet Management
            </TabsTrigger>
          </TabsList>

          {/* Campaign Setup Demo */}
          <TabsContent value="campaign" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Token Configuration
                  </CardTitle>
                  <CardDescription>Configure your token details and trading parameters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="token-address">Token Address</Label>
                    <Input 
                      id="token-address" 
                      value="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" 
                      className="font-mono text-sm"
                      readOnly
                    />
                  </div>
                  <div>
                    <Label htmlFor="token-name">Token Symbol</Label>
                    <Input id="token-name" value="DEMO" readOnly />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="buy-amount">Buy Amount (SOL)</Label>
                      <Input id="buy-amount" value="0.1" readOnly />
                    </div>
                    <div>
                      <Label htmlFor="sell-percentage">Sell at %</Label>
                      <Input id="sell-percentage" value="25%" readOnly />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-trade">Auto Trading</Label>
                    <Switch id="auto-trade" checked />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-success" />
                    Campaign Status
                  </CardTitle>
                  <CardDescription>Monitor your campaign performance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Campaign Progress</span>
                      <span>78%</span>
                    </div>
                    <Progress value={78} className="h-2" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-success">+156%</div>
                      <div className="text-sm text-muted-foreground">Total Gain</div>
                    </div>
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">24</div>
                      <div className="text-sm text-muted-foreground">Trades</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="text-success">Active</Badge>
                    <Badge variant="outline">Auto-Trading</Badge>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Strategy Builder Demo */}
          <TabsContent value="code" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5 text-primary" />
                  Visual Strategy Builder
                </CardTitle>
                <CardDescription>Build complex trading strategies with simple drag-and-drop</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-lg border border-primary/20">
                        <div className="w-3 h-3 bg-primary rounded-full"></div>
                        <span className="font-medium">When price increases by 20%</span>
                        <Badge variant="secondary">Trigger</Badge>
                      </div>
                      <div className="flex justify-center">
                        <div className="w-px h-6 bg-muted-foreground/25"></div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg border border-success/20">
                        <div className="w-3 h-3 bg-success rounded-full"></div>
                        <span className="font-medium">Sell 50% of holdings</span>
                        <Badge variant="secondary">Action</Badge>
                      </div>
                      <div className="flex justify-center">
                        <div className="w-px h-6 bg-muted-foreground/25"></div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-accent/10 rounded-lg border border-accent/20">
                        <div className="w-3 h-3 bg-accent rounded-full"></div>
                        <span className="font-medium">Redistribute funds to team wallets</span>
                        <Badge variant="secondary">Distribution</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" size="sm">
                      <span className="w-2 h-2 bg-primary rounded-full mr-2"></span>
                      Add Trigger
                    </Button>
                    <Button variant="outline" size="sm">
                      <span className="w-2 h-2 bg-success rounded-full mr-2"></span>
                      Add Action
                    </Button>
                    <Button variant="outline" size="sm">
                      <span className="w-2 h-2 bg-accent rounded-full mr-2"></span>
                      Add Logic
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallet Management Demo */}
          <TabsContent value="wallet" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Community Wallet
                  </CardTitle>
                  <CardDescription>Secure multi-signature wallet management</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Total Contributions</span>
                      <span className="text-sm font-bold">12.5 SOL</span>
                    </div>
                    <Progress value={65} className="h-2" />
                    <div className="text-xs text-muted-foreground">5 of 8 team members contributed</div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Team Members</h4>
                    {[
                      { name: "Alice", contributed: "3.2 SOL", status: "Active" },
                      { name: "Bob", contributed: "2.8 SOL", status: "Active" },
                      { name: "Carol", contributed: "4.1 SOL", status: "Active" },
                      { name: "Dave", contributed: "1.9 SOL", status: "Pending" },
                      { name: "Eve", contributed: "0.5 SOL", status: "Active" }
                    ].map((member, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-xs">
                            {member.name[0]}
                          </div>
                          <span className="text-sm">{member.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{member.contributed}</div>
                          <Badge variant={member.status === "Active" ? "default" : "secondary"} className="text-xs">
                            {member.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-success" />
                    Security Features
                  </CardTitle>
                  <CardDescription>Enterprise-grade security for your funds</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-success" />
                        <span className="text-sm">Multi-sig Protection</span>
                      </div>
                      <Badge variant="secondary" className="text-success">Active</Badge>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-success" />
                        <span className="text-sm">Hardware Security</span>
                      </div>
                      <Badge variant="secondary" className="text-success">Enabled</Badge>
                    </div>

                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Private Keys</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowSecrets(!showSecrets)}
                        >
                          {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                      <div className="font-mono text-xs p-2 bg-muted/50 rounded">
                        {showSecrets 
                          ? "3K7X9mN4pQ8rS2tV6wY1z5A7b9C3d6E..." 
                          : "••••••••••••••••••••••••••••••••••••"
                        }
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <Button className="w-full" variant="outline">
                      Request Withdrawal
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Call to Action */}
        <div className="text-center mt-12">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">Ready to Start Trading?</h3>
              <p className="text-muted-foreground mb-6">
                Join thousands of traders using BlackBox to automate their token campaigns
              </p>
              <div className="flex gap-4 justify-center">
                <Button className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity">
                  Create Your Campaign
                </Button>
                <Button variant="outline">
                  Learn More
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Demo;