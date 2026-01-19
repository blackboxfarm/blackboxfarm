import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FarmBanner } from "@/components/FarmBanner";
import { 
  Shield, 
  Lock, 
  Eye, 
  Server, 
  Key, 
  CheckCircle2, 
  AlertTriangle,
  Mail,
  FileText
} from "lucide-react";

export default function Security() {
  const practices = [
    {
      icon: Lock,
      title: "Encrypted Storage",
      description: "All sensitive data including wallet keys and user credentials are encrypted at rest using industry-standard AES-256 encryption."
    },
    {
      icon: Key,
      title: "Secure Key Management",
      description: "Private keys are never stored in plain text. We use secure enclave technology and HSM-grade key management practices."
    },
    {
      icon: Server,
      title: "Infrastructure Security",
      description: "Our infrastructure runs on enterprise-grade cloud providers with SOC 2 compliance, DDoS protection, and 24/7 monitoring."
    },
    {
      icon: Eye,
      title: "Privacy First",
      description: "We collect minimal data necessary for service operation. Your trading strategies and wallet details remain confidential."
    },
    {
      icon: Shield,
      title: "Row-Level Security",
      description: "Database access is protected by row-level security policies ensuring users can only access their own data."
    },
    {
      icon: CheckCircle2,
      title: "Regular Audits",
      description: "We conduct regular security reviews and penetration testing to identify and address potential vulnerabilities."
    }
  ];

  const commitments = [
    "Never sell or share your personal data with third parties",
    "Never store your private keys in unencrypted form",
    "Never access your wallets without explicit permission",
    "Always use HTTPS for all communications",
    "Implement rate limiting to prevent abuse",
    "Maintain comprehensive audit logs",
    "Respond to security incidents within 24 hours",
    "Provide transparent disclosure of any breaches"
  ];

  return (
    <div className="min-h-screen bg-background">
      <FarmBanner />
      
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Shield className="h-12 w-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">Security</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Your security is our priority. Learn how BlackBox Farm protects your data, 
            assets, and privacy across all our services.
          </p>
        </div>

        {/* Security Badge */}
        <div className="flex justify-center gap-3 mb-12">
          <Badge variant="outline" className="text-green-500 border-green-500/50 bg-green-500/10 px-4 py-2">
            <Lock className="h-3 w-3 mr-2" />
            SSL Encrypted
          </Badge>
          <Badge variant="outline" className="text-blue-500 border-blue-500/50 bg-blue-500/10 px-4 py-2">
            <Server className="h-3 w-3 mr-2" />
            SOC 2 Infrastructure
          </Badge>
          <Badge variant="outline" className="text-purple-500 border-purple-500/50 bg-purple-500/10 px-4 py-2">
            <Eye className="h-3 w-3 mr-2" />
            Privacy Focused
          </Badge>
        </div>

        {/* Security Practices */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-center mb-8">Our Security Practices</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {practices.map((practice, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <practice.icon className="h-5 w-5 text-primary" />
                    {practice.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{practice.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Our Commitments */}
        <Card className="mb-12 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              Our Security Commitments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-3">
              {commitments.map((commitment, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground">{commitment}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Responsible Disclosure */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Responsible Disclosure
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              We take security vulnerabilities seriously. If you discover a security issue, 
              please report it to us responsibly. We appreciate your help in keeping BlackBox Farm safe.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/contact">
                <Button variant="outline" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Report a Vulnerability
                </Button>
              </Link>
              <Link to="/privacy">
                <Button variant="ghost" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Privacy Policy
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <div className="text-center">
          <p className="text-muted-foreground mb-4">
            Have security questions or concerns?
          </p>
          <Link to="/contact">
            <Button className="gap-2">
              <Mail className="h-4 w-4" />
              Contact Our Security Team
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
