import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, XCircle, TrendingDown, Zap } from "lucide-react";
import { FarmBanner } from "@/components/FarmBanner";
import { AuthButton } from "@/components/auth/AuthButton";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";

export default function CompetitiveAnalysis() {
  const { user } = useAuth();
  
  useEffect(() => {
    document.title = "Competitive Analysis - Fee Structure Comparison";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Farm Banner Header */}
      <FarmBanner />
      <div className="container mx-auto py-6 space-y-8">
        {/* Main Header Section */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              BlackBox Farm
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Putting the needle in the Haystack - Bumps for the whole Fam!
            </p>
            <div className="flex justify-center md:hidden space-x-3">
              <AuthButton />
            </div>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center gap-3">
            <NotificationCenter />
            <AuthButton />
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <ArrowLeft className="h-10 w-10 text-primary" strokeWidth={3} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Competitive Fee Analysis</h1>
            <p className="text-muted-foreground">How we stack up against market leaders</p>
          </div>
        </div>

        {/* Executive Summary */}
        <Card className="mb-8 border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="text-green-800 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Executive Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="text-green-700">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">🎯 Key Advantages</h3>
                <ul className="space-y-1 text-sm">
                  <li>• <strong>90%+ cheaper</strong> on volume operations (50+ trades)</li>
                  <li>• <strong>67% cheaper</strong> on micro-trades (&lt;$0.05)</li>
                  <li>• Smart fee selection automatically optimizes costs</li>
                  <li>• Batch pricing model for large operations</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2">💡 Strategy</h3>
                <ul className="space-y-1 text-sm">
                  <li>• Undercut on small trades with micro-fees</li>
                  <li>• Dominate volume market with batch pricing</li>
                  <li>• Use Smithii-proven model (0.025 SOL/100 ops)</li>
                  <li>• Position as "smart pricing" not just "cheap"</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Competitor Comparison Table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Market Comparison - Real Data</CardTitle>
            <p className="text-sm text-muted-foreground">Based on current market rates (August 2025)</p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Platform</th>
                    <th className="text-left p-3">Fee Structure</th>
                    <th className="text-left p-3">Gas/Priority Fees</th>
                    <th className="text-left p-3">Best For</th>
                    <th className="text-left p-3">Our Advantage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-primary/5">
                    <td className="p-3 font-medium">
                      <Badge className="bg-primary">Our Platform</Badge>
                    </td>
                    <td className="p-3">
                      <div>Batch: 0.025 SOL/100 ops</div>
                      <div>Micro: 0.0005 SOL/trade</div>
                    </td>
                    <td className="p-3">
                      <div>Economy: 0.0005 SOL</div>
                      <div>Standard: 0.00015 SOL</div>
                    </td>
                    <td className="p-3">All volume levels</td>
                    <td className="p-3 text-green-600 font-medium">Market leader</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 font-medium">Trojan Bot</td>
                    <td className="p-3">
                      <div>0.9% per trade (with referral)</div>
                      <div>~1% without referral</div>
                    </td>
                    <td className="p-3">
                      <div>Fast: 0.0015 SOL</div>
                      <div>Turbo: 0.0075 SOL</div>
                    </td>
                    <td className="p-3">General trading</td>
                    <td className="p-3 text-green-600">67-90% cheaper</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 font-medium">Maestro Bot</td>
                    <td className="p-3">
                      <div>Free: 1% per trade</div>
                      <div>Premium: $200/month + lower fees</div>
                    </td>
                    <td className="p-3">Variable priority fees</td>
                    <td className="p-3">High-frequency traders</td>
                    <td className="p-3 text-green-600">No monthly fees</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 font-medium">MevX</td>
                    <td className="p-3">~0.8% per trade</td>
                    <td className="p-3">Standard network fees</td>
                    <td className="p-3">MEV protection</td>
                    <td className="p-3 text-green-600">80-95% cheaper</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3 font-medium">BananaGunBot</td>
                    <td className="p-3">0.5-1% per trade</td>
                    <td className="p-3">Standard network fees</td>
                    <td className="p-3">Telegram integration</td>
                    <td className="p-3 text-green-600">75-95% cheaper</td>
                  </tr>
                  <tr className="border-b bg-orange-50">
                    <td className="p-3 font-medium">
                      <Badge variant="secondary">Smithii Bumps</Badge>
                    </td>
                    <td className="p-3">
                      <div>0.025 SOL per 100 makers</div>
                      <div>(Our batch model)</div>
                    </td>
                    <td className="p-3">Included in batch</td>
                    <td className="p-3">Volume/bump operations</td>
                    <td className="p-3 text-blue-600">We match their model</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Use Case Scenarios */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-blue-500" />
                Small Trades Scenario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="font-medium">10 trades × $0.01 each</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Our cost:</span>
                    <span className="text-green-600 font-medium">0.005 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Trojan:</span>
                    <span className="text-red-500">0.015 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Maestro:</span>
                    <span className="text-red-500">0.02 SOL</span>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">67-75% savings</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-orange-500" />
                Medium Volume Scenario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="font-medium">100 trades × $0.05 each</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Our batch cost:</span>
                    <span className="text-green-600 font-medium">0.025 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Trojan:</span>
                    <span className="text-red-500">0.15 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Maestro:</span>
                    <span className="text-red-500">0.25 SOL</span>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">83-90% savings</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                High Volume Scenario
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="font-medium">500 trades × $0.10 each</div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span>Our batch cost:</span>
                    <span className="text-green-600 font-medium">0.125 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Trojan:</span>
                    <span className="text-red-500">2.25 SOL</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Maestro:</span>
                    <span className="text-red-500">2.5 SOL</span>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">94-95% savings</Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Market Position */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Market Positioning Strategy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-green-700 mb-3">✅ What We Do Better</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <strong>Smart Pricing:</strong> Automatically selects optimal fee structure
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <strong>Volume Discounts:</strong> Batch pricing beats everyone on 50+ operations
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <strong>Micro-Trade Optimization:</strong> 67% cheaper than competitors on small trades
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                    <div>
                      <strong>No Monthly Fees:</strong> Pay only for what you use
                    </div>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-blue-700 mb-3">🎯 Messaging Strategy</h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                    <div>
                      <strong>For Small Traders:</strong> "Start trading with micro-fees - 0.0005 SOL per trade"
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                    <div>
                      <strong>For Volume Traders:</strong> "90%+ savings with batch pricing - proven Smithii model"
                    </div>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                    <div>
                      <strong>For Everyone:</strong> "Smart fees that adapt to your trading style"
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bottom CTA */}
        <div className="text-center">
          <Button onClick={() => window.history.back()}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}