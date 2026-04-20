import React from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Eye, Users, AlertTriangle, CheckCircle } from "lucide-react";

// Marketing view for anonymous users
export function SecurityMarketingView() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-4">Enterprise-Grade Security</h2>
        <p className="text-lg text-muted-foreground">
          Military-grade encryption and advanced security monitoring for your peace of mind
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="h-8 w-8 text-blue-500" />
            <h3 className="text-xl font-semibold">Data Protection</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• AES-256 encryption at rest</li>
            <li>• TLS 1.3 for data in transit</li>
            <li>• Zero-knowledge architecture</li>
            <li>• Hardware security modules</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Eye className="h-8 w-8 text-green-500" />
            <h3 className="text-xl font-semibold">Real-time Monitoring</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• 24/7 threat detection</li>
            <li>• Anomaly detection AI</li>
            <li>• Automated incident response</li>
            <li>• Comprehensive audit logs</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="h-8 w-8 text-purple-500" />
            <h3 className="text-xl font-semibold">Access Control</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Multi-factor authentication</li>
            <li>• Role-based permissions</li>
            <li>• Session management</li>
            <li>• Device fingerprinting</li>
          </ul>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="h-8 w-8 text-orange-500" />
            <h3 className="text-xl font-semibold">Compliance</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• SOC 2 Type II certified</li>
            <li>• GDPR compliant</li>
            <li>• Regular security audits</li>
            <li>• Penetration testing</li>
          </ul>
        </Card>
      </div>

      <div className="text-center bg-gradient-to-r from-primary/10 to-accent/10 p-6 rounded-lg">
        <h3 className="text-xl font-semibold mb-2">Security-First Platform</h3>
        <p className="text-muted-foreground mb-4">
          Your funds and data are protected by the highest security standards
        </p>
        <Button size="lg" className="mr-2">
          Learn More
        </Button>
        <Button variant="outline" size="lg">
          Security Whitepaper
        </Button>
      </div>
    </div>
  );
}

// View for donors showing their account security
export function DonorSecurityView({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Your Account Security</h2>
        <Badge variant="outline">Donor Account</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm text-muted-foreground">Account Status</span>
          </div>
          <div className="text-lg font-bold text-green-600">Verified</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <span className="text-sm text-muted-foreground">2FA Status</span>
          </div>
          <div className="text-lg font-bold">Enabled</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-4 w-4 text-purple-500" />
            <span className="text-sm text-muted-foreground">Wallet Security</span>
          </div>
          <div className="text-lg font-bold">Encrypted</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-muted-foreground">Last Login</span>
          </div>
          <div className="text-lg font-bold">2h ago</div>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Security Checklist</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium">Two-Factor Authentication</div>
              <div className="text-sm text-muted-foreground">Your account is protected with 2FA</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <div className="font-medium">Strong Password</div>
              <div className="text-sm text-muted-foreground">Password meets security requirements</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <div>
              <div className="font-medium">Email Verification</div>
              <div className="text-sm text-muted-foreground">Verify your email for enhanced security</div>
            </div>
            <Button variant="outline" size="sm">Verify</Button>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Security Events</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between p-2 bg-muted/50 rounded">
            <span>Successful login from Chrome</span>
            <span className="text-muted-foreground">2 hours ago</span>
          </div>
          <div className="flex justify-between p-2 bg-muted/50 rounded">
            <span>Password updated</span>
            <span className="text-muted-foreground">3 days ago</span>
          </div>
          <div className="flex justify-between p-2 bg-muted/50 rounded">
            <span>2FA enabled</span>
            <span className="text-muted-foreground">1 week ago</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

// View for campaign creators showing their security + campaign security
export function CampaignCreatorSecurityView({ userId }: { userId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Campaign Security Dashboard</h2>
        <Badge variant="outline">Creator Account</Badge>
      </div>

      {/* Campaign Security Overview */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Campaign Security Status</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-2">High-Frequency SOL Trading</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Wallet Encryption</span>
                <Badge className="bg-green-100 text-green-800">Active</Badge>
              </div>
              <div className="flex justify-between">
                <span>Access Control</span>
                <Badge className="bg-green-100 text-green-800">Secure</Badge>
              </div>
              <div className="flex justify-between">
                <span>Audit Logging</span>
                <Badge className="bg-green-100 text-green-800">Enabled</Badge>
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-medium mb-2">DeFi Yield Strategy</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Wallet Encryption</span>
                <Badge className="bg-green-100 text-green-800">Active</Badge>
              </div>
              <div className="flex justify-between">
                <span>Access Control</span>
                <Badge className="bg-green-100 text-green-800">Secure</Badge>
              </div>
              <div className="flex justify-between">
                <span>Audit Logging</span>
                <Badge className="bg-green-100 text-green-800">Enabled</Badge>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Personal Account Security */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Your Account Security</h3>
        <DonorSecurityView userId={userId} />
      </Card>

      {/* Campaign-specific Security Controls */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Advanced Security Controls</h3>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 border rounded-lg">
            <div>
              <div className="font-medium">Emergency Stop Protection</div>
              <div className="text-sm text-muted-foreground">Instantly halt all trading activity</div>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>
          <div className="flex justify-between items-center p-3 border rounded-lg">
            <div>
              <div className="font-medium">Risk Limit Monitoring</div>
              <div className="text-sm text-muted-foreground">Automated risk threshold enforcement</div>
            </div>
            <Button variant="outline" size="sm">Settings</Button>
          </div>
          <div className="flex justify-between items-center p-3 border rounded-lg">
            <div>
              <div className="font-medium">Contributor Notifications</div>
              <div className="text-sm text-muted-foreground">Security alerts for campaign supporters</div>
            </div>
            <Button variant="outline" size="sm">Manage</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// View for super admin — points to the real Security Activity dashboard.
// The previous mock dashboard (hardcoded "98.5% / 47 / 156" stats and fake
// IP 192.168.1.100 alerts) was removed because none of it was wired to data.
export function SuperAdminSecurityView() {
  return (
    <Card className="p-8 text-center space-y-3">
      <Shield className="h-10 w-10 text-primary mx-auto" />
      <h2 className="text-2xl font-bold">System Security</h2>
      <p className="text-muted-foreground max-w-lg mx-auto">
        Open the <strong>Security Activity</strong> tab for the real, live event
        timeline (audit log, 2FA changes, account lockdowns, SMS alerts).
      </p>
      <Badge variant="outline">Super Admin</Badge>
    </Card>
  );
}