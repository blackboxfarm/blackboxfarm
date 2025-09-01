import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  User, 
  Wallet, 
  TrendingUp, 
  AlertTriangle, 
  Shield, 
  Activity,
  Search,
  FileText,
  Lock,
  Eye,
  DollarSign
} from 'lucide-react';

interface RiskFactor {
  id: string;
  type: 'low' | 'medium' | 'high' | 'critical';
  category: 'security' | 'trading' | 'compliance' | 'operational';
  title: string;
  description: string;
  recommendation: string;
  impact: string;
}

export const AccountAuditPanel = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccountType, setSelectedAccountType] = useState<'user' | 'campaign'>('user');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Mock risk factors - will be replaced with real data
  const mockRiskFactors: RiskFactor[] = [
    {
      id: 'high-value-trading',
      type: 'medium',
      category: 'trading',
      title: 'High-Value Trading Pattern',
      description: 'Account shows consistent high-volume trading activity exceeding $10K daily',
      recommendation: 'Implement enhanced monitoring and require additional verification for trades >$25K',
      impact: 'Potential for significant losses if compromised'
    },
    {
      id: 'multi-device-access',
      type: 'low',
      category: 'security',
      title: 'Multiple Device Access',
      description: 'Account accessed from 3+ different devices in the last 30 days',
      recommendation: 'Enable device fingerprinting and require 2FA for new devices',
      impact: 'Increased attack surface'
    },
    {
      id: 'no-2fa',
      type: 'high',
      category: 'security',
      title: '2FA Not Enabled',
      description: 'Two-factor authentication is not configured for this account',
      recommendation: 'Mandate 2FA activation before allowing trading activities',
      impact: 'Critical vulnerability to account takeover'
    },
    {
      id: 'irregular-patterns',
      type: 'medium',
      category: 'compliance',
      title: 'Irregular Trading Times',
      description: 'Trading activity detected during unusual hours (2-6 AM local time)',
      recommendation: 'Review trading patterns and implement time-based alerts',
      impact: 'Potential unauthorized access indicator'
    }
  ];

  const safetyTips = [
    {
      icon: <Lock className="h-4 w-4" />,
      title: 'Enable Two-Factor Authentication',
      description: 'Add an extra layer of security to your account'
    },
    {
      icon: <Eye className="h-4 w-4" />,
      title: 'Regular Security Audits',
      description: 'Review your account activity monthly'
    },
    {
      icon: <Shield className="h-4 w-4" />,
      title: 'Use Strong Passwords',
      description: 'Update passwords every 90 days'
    },
    {
      icon: <DollarSign className="h-4 w-4" />,
      title: 'Set Trading Limits',
      description: 'Configure daily and transaction limits'
    }
  ];

  const getRiskColor = (type: string) => {
    switch (type) {
      case 'low':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'medium':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'high':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'critical':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security':
        return <Shield className="h-4 w-4" />;
      case 'trading':
        return <TrendingUp className="h-4 w-4" />;
      case 'compliance':
        return <FileText className="h-4 w-4" />;
      case 'operational':
        return <Activity className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const handleRunAudit = async () => {
    setIsAnalyzing(true);
    // Simulate analysis time
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Account Risk Analysis
          </CardTitle>
          <CardDescription>
            Comprehensive audit of account security, trading patterns, and compliance status
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Input
                placeholder="Enter account ID, email, or campaign ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Tabs value={selectedAccountType} onValueChange={(value) => setSelectedAccountType(value as 'user' | 'campaign')}>
              <TabsList>
                <TabsTrigger value="user" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  User Account
                </TabsTrigger>
                <TabsTrigger value="campaign" className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  Campaign
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button 
              onClick={handleRunAudit}
              disabled={!searchTerm || isAnalyzing}
              className="gap-2"
            >
              <Activity className={`h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              {isAnalyzing ? 'Analyzing...' : 'Run Audit'}
            </Button>
          </div>

          {!searchTerm && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Enter an account identifier to begin risk analysis. This will analyze security posture, trading patterns, and compliance status.
              </AlertDescription>
            </Alert>
          )}

          {searchTerm && (
            <div className="space-y-6">
              {/* Mock Account Summary */}
              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Account Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-primary">7.2</div>
                      <div className="text-sm text-muted-foreground">Risk Score</div>
                      <Badge className="mt-1 bg-yellow-500/10 text-yellow-500">Medium Risk</Badge>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-primary">156</div>
                      <div className="text-sm text-muted-foreground">Days Active</div>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-primary">$47.3K</div>
                      <div className="text-sm text-muted-foreground">Total Volume</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Risk Factors */}
              <Card>
                <CardHeader>
                  <CardTitle>Identified Risk Factors</CardTitle>
                  <CardDescription>
                    {mockRiskFactors.length} risk factors identified requiring attention
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {mockRiskFactors.map((risk) => (
                      <div key={risk.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            {getCategoryIcon(risk.category)}
                            <h4 className="font-medium">{risk.title}</h4>
                          </div>
                          <Badge className={getRiskColor(risk.type)}>
                            {risk.type.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {risk.description}
                        </p>
                        <div className="bg-muted/50 p-3 rounded-md">
                          <p className="text-sm">
                            <strong>Recommendation:</strong> {risk.recommendation}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            <strong>Impact:</strong> {risk.impact}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Safety Tips */}
              <Card>
                <CardHeader>
                  <CardTitle>Safety Recommendations</CardTitle>
                  <CardDescription>
                    Best practices to improve account security and reduce risk
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {safetyTips.map((tip, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className="text-primary mt-1">
                          {tip.icon}
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{tip.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {tip.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};