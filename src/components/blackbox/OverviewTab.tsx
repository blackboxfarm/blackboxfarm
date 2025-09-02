import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Zap, 
  Shield, 
  TrendingUp, 
  Wallet, 
  Target,
  ArrowRight,
  Play
} from "lucide-react";

export function OverviewTab() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <Badge variant="secondary" className="px-4 py-2 text-sm">
          🚀 The Future of Token Pumping is Here
        </Badge>
        <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          BumpBot Campaigns Made Simple
        </h2>
        <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
          Create an account, set up your token campaign, invite your team to the secure community wallet, 
          and watch the pump - all with just a few clicks.
        </p>
      </div>

      {/* How It Works Steps */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="text-center p-6 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="h-6 w-6 text-primary" />
            <span className="absolute -mt-8 -mr-8 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">1</span>
          </div>
          <h3 className="text-lg font-semibold mb-2">Create Account</h3>
          <p className="text-sm text-muted-foreground">
            Sign up with secure 2FA authentication and phone verification
          </p>
        </Card>

        <Card className="text-center p-6 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="h-6 w-6 text-primary" />
            <span className="absolute -mt-8 -mr-8 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">2</span>
          </div>
          <h3 className="text-lg font-semibold mb-2">Setup Campaign</h3>
          <p className="text-sm text-muted-foreground">
            Configure simple or complex BumpBot strategies for your token
          </p>
        </Card>

        <Card className="text-center p-6 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="h-6 w-6 text-primary" />
            <span className="absolute -mt-8 -mr-8 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">3</span>
          </div>
          <h3 className="text-lg font-semibold mb-2">Invite Team</h3>
          <p className="text-sm text-muted-foreground">
            Add team members to contribute to your secure community wallet
          </p>
        </Card>

        <Card className="text-center p-6 hover:shadow-lg transition-shadow">
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="absolute -mt-8 -mr-8 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">4</span>
          </div>
          <h3 className="text-lg font-semibold mb-2">Watch the Pump</h3>
          <p className="text-sm text-muted-foreground">
            Click-it-and-forget-it automated trading with real-time monitoring
          </p>
        </Card>
      </div>

      {/* Campaign Types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 border-2 border-primary/20 hover:border-primary/40 transition-colors">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <Zap className="h-8 w-8 text-green-500" />
              <div>
                <CardTitle className="text-xl">Simple Campaigns</CardTitle>
                <p className="text-sm text-muted-foreground">Perfect for beginners</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                One-click campaign setup
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Pre-configured trading strategies
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Automated risk management
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                24/7 monitoring included
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="p-6 border-2 border-primary/20 hover:border-primary/40 transition-colors">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-blue-500" />
              <div>
                <CardTitle className="text-xl">Complex Campaigns</CardTitle>
                <p className="text-sm text-muted-foreground">Advanced customization</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Custom trading parameters
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Multi-phase campaign strategies
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Advanced analytics & reporting
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-primary" />
                Custom team permissions
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 text-center">
          <Shield className="h-12 w-12 text-blue-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Enterprise Security</h3>
          <p className="text-sm text-muted-foreground">
            2FA authentication, phone verification, and enterprise-grade encryption protect your funds
          </p>
        </Card>

        <Card className="p-6 text-center">
          <Zap className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Lightning Fast</h3>
          <p className="text-sm text-muted-foreground">
            Sub-second trade execution with MEV protection and gas optimization
          </p>
        </Card>

        <Card className="p-6 text-center">
          <TrendingUp className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Real-Time Analytics</h3>
          <p className="text-sm text-muted-foreground">
            Live dashboards, instant notifications, and comprehensive performance tracking
          </p>
        </Card>
      </div>

      {/* Ready to Get Started Section */}
      <div className="text-center bg-gradient-to-r from-primary/10 to-accent/10 p-8 rounded-lg">
        <h3 className="text-2xl font-semibold mb-3">Ready to Get Started?</h3>
        <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
          Join thousands of successful token projects using BlackBox Farm's automated BumpBot campaigns. 
          Start pumping your token with enterprise-grade security and transparency.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg" className="px-8">
            Create Account
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" size="lg" className="px-8">
            <Play className="mr-2 h-4 w-4" />
            View Demo
          </Button>
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        <div>
          <div className="text-3xl font-bold text-primary">1,200+</div>
          <div className="text-sm text-muted-foreground">Active Campaigns</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-primary">$2.5M+</div>
          <div className="text-sm text-muted-foreground">Total Volume</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-primary">87%</div>
          <div className="text-sm text-muted-foreground">Success Rate</div>
        </div>
        <div>
          <div className="text-3xl font-bold text-primary">24/7</div>
          <div className="text-sm text-muted-foreground">Monitoring</div>
        </div>
      </div>
    </div>
  );
}