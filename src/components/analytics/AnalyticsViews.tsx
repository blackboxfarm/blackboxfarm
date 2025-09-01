import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, BarChart3, Shield, Zap, Users, Globe } from "lucide-react";

// Marketing view for anonymous users
export function AnalyticsMarketingView() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-4">Advanced Trading Analytics</h2>
        <p className="text-lg text-muted-foreground">
          Real-time insights, performance tracking, and intelligent market analysis
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-8 w-8 text-green-500" />
            <h3 className="text-xl font-semibold">Performance Tracking</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Real-time P&L calculations</li>
            <li>• Success rate monitoring</li>
            <li>• Trade execution analytics</li>
            <li>• Risk-adjusted returns</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <BarChart3 className="h-8 w-8 text-blue-500" />
            <h3 className="text-xl font-semibold">Market Intelligence</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Token performance analysis</li>
            <li>• Volatility scoring</li>
            <li>• Market trend detection</li>
            <li>• Opportunity identification</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="h-8 w-8 text-purple-500" />
            <h3 className="text-xl font-semibold">Speed & Efficiency</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Sub-second trade execution</li>
            <li>• Gas fee optimization</li>
            <li>• Slippage minimization</li>
            <li>• MEV protection</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="h-8 w-8 text-orange-500" />
            <h3 className="text-xl font-semibold">24/7 Monitoring</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Continuous market scanning</li>
            <li>• Automated reporting</li>
            <li>• Alert systems</li>
            <li>• Historical data analysis</li>
          </ul>
        </Card>
      </div>

      <div className="text-center bg-gradient-to-r from-primary/10 to-accent/10 p-6 rounded-lg">
        <h3 className="text-xl font-semibold mb-2">Ready to Get Started?</h3>
        <p className="text-muted-foreground mb-4">
          Join thousands of traders using our analytics platform
        </p>
        <Button size="lg" className="mr-2">
          Sign Up Free
        </Button>
        <Button variant="outline" size="lg">
          View Demo
        </Button>
      </div>
    </div>
  );
}

// View for donors showing their donation analytics
export function DonorAnalyticsView({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Your Contribution Analytics</h2>
        <Badge variant="outline">Donor Dashboard</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Contributed</div>
          <div className="text-2xl font-bold">2.5 SOL</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Campaigns Supported</div>
          <div className="text-2xl font-bold">3</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Estimated Returns</div>
          <div className="text-2xl font-bold text-green-600">+12%</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Active Campaigns</div>
          <div className="text-2xl font-bold">2</div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Your Campaigns Performance</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
            <div>
              <div className="font-medium">SOL Momentum Campaign</div>
              <div className="text-sm text-muted-foreground">Contributed: 1.0 SOL</div>
            </div>
            <Badge className="bg-green-100 text-green-800">+8.5%</Badge>
          </div>
          <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
            <div>
              <div className="font-medium">DeFi Growth Strategy</div>
              <div className="text-sm text-muted-foreground">Contributed: 1.5 SOL</div>
            </div>
            <Badge className="bg-blue-100 text-blue-800">+15.2%</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}

// View for campaign creators showing campaign analytics
export function CampaignCreatorAnalyticsView({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Campaign Analytics</h2>
        <Badge variant="outline">Creator Dashboard</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Active Campaigns</div>
          <div className="text-2xl font-bold">2</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Funding</div>
          <div className="text-2xl font-bold">45.2 SOL</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Success Rate</div>
          <div className="text-2xl font-bold text-green-600">87%</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Profit</div>
          <div className="text-2xl font-bold text-green-600">+8.7 SOL</div>
        </Card>
      </div>

      {/* Campaign Performance Details */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Campaign Performance</h3>
        <div className="space-y-4">
          <div className="p-4 border rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-medium">High-Frequency SOL Trading</h4>
                <p className="text-sm text-muted-foreground">Created 5 days ago</p>
              </div>
              <Badge className="bg-green-100 text-green-800">Running</Badge>
            </div>
            <div className="grid grid-cols-4 gap-4 mt-3">
              <div>
                <div className="text-xs text-muted-foreground">Funding</div>
                <div className="font-medium">25.0 SOL</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Trades</div>
                <div className="font-medium">156</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Success</div>
                <div className="font-medium">89%</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Profit</div>
                <div className="font-medium text-green-600">+5.2 SOL</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Donor Analytics */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Your Contributions</h3>
        <div className="text-sm text-muted-foreground">
          Also showing your personal donation analytics...
        </div>
        <DonorAnalyticsView userId={userId} />
      </Card>
    </div>
  );
}

// View for super admin showing system-wide analytics
export function SuperAdminAnalyticsView() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">System-Wide Analytics</h2>
        <Badge variant="outline" className="bg-red-100 text-red-800">Super Admin</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Users</div>
          <div className="text-2xl font-bold">1,247</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Volume</div>
          <div className="text-2xl font-bold">2,456 SOL</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Active Campaigns</div>
          <div className="text-2xl font-bold">89</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Platform Revenue</div>
          <div className="text-2xl font-bold">124.5 SOL</div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Platform Metrics</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-2">User Growth</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>New Users (24h)</span>
                <span className="font-medium">+23</span>
              </div>
              <div className="flex justify-between">
                <span>Active Users (24h)</span>
                <span className="font-medium">456</span>
              </div>
              <div className="flex justify-between">
                <span>Retention Rate</span>
                <span className="font-medium">78%</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">Trading Metrics</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Trades (24h)</span>
                <span className="font-medium">2,340</span>
              </div>
              <div className="flex justify-between">
                <span>Success Rate</span>
                <span className="font-medium">85.2%</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Trade Size</span>
                <span className="font-medium">0.15 SOL</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">System Health</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">99.8%</div>
            <div className="text-sm text-muted-foreground">Uptime</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">1.2s</div>
            <div className="text-sm text-muted-foreground">Avg Response</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">0.001%</div>
            <div className="text-sm text-muted-foreground">Error Rate</div>
          </div>
        </div>
      </Card>
    </div>
  );
}