import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Github, Twitter, MessageCircle, Mail, Shield, FileText, Globe, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-muted/20 border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center p-1">
                <img 
                  src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                  alt="BlackBox Cube Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-bold text-lg">BlackBox Farm</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Democratizing DeFi trading with transparent, affordable, and secure automated solutions for the Solana ecosystem.
            </p>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">DeFi</Badge>
              <Badge variant="outline" className="text-xs">Web3</Badge>
              <Badge variant="outline" className="text-xs">Open Source</Badge>
            </div>
          </div>

          {/* Product Links */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
                  Fee Calculator
                </Link>
              </li>
              <li>
                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
                  Volume Simulator
                </Link>
              </li>
              <li>
                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
                  Community Campaigns
                </Link>
              </li>
              <li>
                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
                  Analytics Dashboard
                </Link>
              </li>
              <li>
                <Link to="/" className="text-muted-foreground hover:text-primary transition-colors">
                  Security Center
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <Heart className="h-3 w-3" />
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <Mail className="h-3 w-3" />
                  Contact Us
                </Link>
              </li>
              <li>
                <Link to="/web3-manifesto" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  Web3 Manifesto
                </Link>
              </li>
              <li>
                <Link to="/whitepaper" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  White Paper
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal & Social */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide">Legal & Social</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <Shield className="h-3 w-3" />
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/cookies" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <FileText className="h-3 w-3" />
                  Cookie Policy
                </Link>
              </li>
            </ul>
            
            <div className="pt-2">
              <h4 className="font-medium text-sm mb-2">Connect With Us</h4>
              <div className="flex gap-3">
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                  <Twitter className="h-4 w-4" />
                </a>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                  <Github className="h-4 w-4" />
                </a>
                <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                  <MessageCircle className="h-4 w-4" />
                </a>
                <a href="mailto:support@blackboxfarm.io" className="text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Bottom Section */}
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} BlackBox Farm. All rights reserved. Built with ❤️ for the DeFi community.
          </div>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>All systems operational</span>
            </div>
            <Badge variant="outline" className="text-xs">
              v2.1.0
            </Badge>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-xs text-muted-foreground max-w-4xl mx-auto">
            BlackBox Farm is not a registered investment advisor. All trading involves risk of loss. 
            Past performance does not guarantee future results. Please trade responsibly and only with funds you can afford to lose. 
            This platform is provided for educational and technological demonstration purposes.
          </p>
        </div>
      </div>
    </footer>
  );
}