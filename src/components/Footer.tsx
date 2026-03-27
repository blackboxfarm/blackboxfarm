import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Github, Twitter, MessageCircle, Mail, Shield, FileText, Globe, Heart, Instagram } from "lucide-react";
import { XSuspendedPopover } from "@/components/XSuspendedPopover";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";

export function Footer() {
  const { isAuthenticated } = useAuth();
  const { isSuperAdmin } = useUserRoles();
  
  return (
    <footer className="bg-muted/20 border-t">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center p-1">
                <img 
                  src="/lovable-uploads/7283e809-e703-4594-8dc8-a1ade76b06de.png" 
                  alt="BlackBox Cube Logo" 
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="font-bold text-lg">BlackBox Farm</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Bringing transparency to on-chain markets through open blockchain intelligence.
              AI-powered analytics, wallet tracing, and network analysis for the Solana ecosystem.
            </p>
            <div className="flex gap-2">
              <Badge variant="outline" className="text-xs">On-Chain AI</Badge>
              <Badge variant="outline" className="text-xs">Social ID Trace</Badge>
              <Badge variant="outline" className="text-xs">Launch Tracking</Badge>
            </div>
          </div>


          {/* Product Links - Hidden */}
          <div className="space-y-4 hidden">
            <h3 className="font-semibold text-sm uppercase tracking-wide">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/?tab=volume-sim" className="text-muted-foreground hover:text-primary transition-colors">
                  Fee Calculator
                </Link>
              </li>
              <li>
                <Link to="/?tab=volume-sim" className="text-muted-foreground hover:text-primary transition-colors">
                  Volume Simulator
                </Link>
              </li>
              {isAuthenticated && (
                <li>
                  <Link to="/community-wallet" className="text-muted-foreground hover:text-primary transition-colors">
                    Community Campaigns
                  </Link>
                </li>
              )}
              {isAuthenticated && (
                <li>
                  <Link to="/?tab=analytics" className="text-muted-foreground hover:text-primary transition-colors">
                    Analytics Dashboard
                  </Link>
                </li>
              )}
              {isSuperAdmin && (
                <li>
                  <Link to="/super-admin?tab=security" className="text-muted-foreground hover:text-primary transition-colors">
                    Security Center
                  </Link>
                </li>
              )}
            </ul>
          </div>
          {/* Apps & Services */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-wide">Apps & Services</h3>
            <ul className="space-y-2 text-sm">
              <li className="hidden">
                <Link to="/bumpbot" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>⚡</span>
                  BumpBot
                </Link>
              </li>
              <li className="hidden">
                <Link to="/volumebot" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>📊</span>
                  Volume Bot
                </Link>
              </li>
              <li>
                <Link to="/holders-info" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>👥</span>
                  Holders Analysis
                </Link>
              </li>
              <li className="hidden">
                <Link to="/holders-bot" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>🤖</span>
                  Holders Bot
                </Link>
              </li>
              <li>
                <Link to="/tgbot" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <MessageCircle className="h-3 w-3 text-blue-400" />
                  Telegram Bot
                  <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-400/30 text-green-400">Live</Badge>
                </Link>
              </li>
              <li className="hidden">
                <Link to="/adverts" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>📢</span>
                  Marketing
                </Link>
              </li>
              <li className="hidden">
                <Link to="/security" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>🔒</span>
                  Security
                </Link>
              </li>
              <li>
                <Link to="/bubblepromo" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>🫧</span>
                  Bubble Map
                </Link>
              </li>
              <li>
                <Link to="/features" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>✨</span>
                  Features
                </Link>
              </li>
              <li>
                <a href="https://t.me/HoldersIntel" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <MessageCircle className="h-3 w-3 text-blue-400" />
                  HoldersIntel Channel
                </a>
              </li>
            </ul>
          </div>

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
                <Link to="/adverts" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  Advertise
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
              <li>
                <Link to="/api" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>🔌</span>
                  API
                </Link>
              </li>
              <li>
                <Link to="/api-docs" className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-2">
                  <span>📖</span>
                  API Docs
                </Link>
              </li>
            </ul>
            
            <div className="pt-2">
              <h4 className="font-medium text-sm mb-2">Connect With Us</h4>
              <div className="flex gap-3 flex-wrap">
                <XSuspendedPopover>
                  <Twitter className="h-4 w-4" />
                </XSuspendedPopover>
                <a href="https://t.me/HoldersIntel" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-400 transition-colors">
                  <MessageCircle className="h-4 w-4" />
                </a>
                <a href="https://www.facebook.com/profile.php?id=61577553852826" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-600 transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="https://www.instagram.com/holdersintel" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors">
                  <Instagram className="h-4 w-4" />
                </a>
                <a href="https://www.threads.com/@holdersintel" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.781 3.632 2.695 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.26 1.33-3.017.88-.724 2.107-1.127 3.553-1.166 1.089-.03 2.09.106 2.988.404-.084-1.003-.455-1.768-1.106-2.28-.737-.578-1.8-.862-3.16-.843l-.04-2.12c1.767-.033 3.248.395 4.4 1.27 1.26.96 1.972 2.38 2.117 4.215l.007.1c.065.088.127.18.185.276.886 1.435 1.238 3.175.988 4.895-.325 2.24-1.503 4.067-3.412 5.293C17.095 23.263 14.873 23.975 12.186 24zm-.09-8.35c-.052 0-.104.001-.157.004-.96.052-1.677.36-2.066.69-.395.336-.56.729-.533 1.205.033.588.353 1.058.925 1.358.599.314 1.378.455 2.186.413 1.07-.058 1.876-.462 2.394-1.2.347-.494.6-1.132.752-1.9-.93-.372-1.95-.57-3.027-.57h-.474z"/></svg>
                </a>
                <a href="https://www.tiktok.com/@holdersintel" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
                </a>
                <a href="mailto:support@blackbox.farm" className="text-muted-foreground hover:text-primary transition-colors">
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
            © {new Date().getFullYear()} BlackBox Farm. All rights reserved. Built with 🍆 for the DeFi community.
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
            BlackBox Farm provides AI-generated blockchain analytics and research tools designed to improve transparency in on-chain markets. The platform does not provide investment advice, financial recommendations, or trading signals. All information is presented for informational and research purposes only. Cryptocurrency markets are highly speculative and users should conduct their own independent research before making any financial decisions.
          </p>
        </div>
      </div>
    </footer>
  );
}