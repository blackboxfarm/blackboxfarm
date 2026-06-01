import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function SiteFooter() {
  const { data: intelPublic } = useQuery({
    queryKey: ['intel-public-access'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'intel_briefings_public')
        .maybeSingle();
      return data?.value === 'true';
    },
    staleTime: 60_000,
  });

  return (
    <footer className="border-t border-border/40 bg-muted/30 mt-8">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div className="space-y-2">
            <h4 className="font-semibold text-foreground">Products</h4>
            <ul className="space-y-1.5 text-muted-foreground">
              <li><Link to="/holders" className="hover:text-primary transition-colors">Holders Intel</Link></li>
              <li><Link to="/tgbot" className="hover:text-primary transition-colors">Telegram Bot</Link></li>
              <li><Link to="/bumpbot" className="hover:text-primary transition-colors">Bump Bot</Link></li>
              <li><Link to="/volumebot" className="hover:text-primary transition-colors">Volume Bot</Link></li>
              <li><Link to="/token-archive" className="hover:text-primary transition-colors">🗄 Token Archive</Link></li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-foreground">Company</h4>
            <ul className="space-y-1.5 text-muted-foreground">
              <li><Link to="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              <li><Link to="/whitepaper" className="hover:text-primary transition-colors">Whitepaper</Link></li>
              {intelPublic && <li><Link to="/intel" className="hover:text-primary transition-colors">Intel Briefings</Link></li>}
              <li><Link to="/api-docs" className="hover:text-primary transition-colors">API Docs</Link></li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-foreground">Legal</h4>
            <ul className="space-y-1.5 text-muted-foreground">
              <li><Link to="/terms" className="hover:text-primary transition-colors">Terms of Service</Link></li>
              <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/cookies" className="hover:text-primary transition-colors">Cookie Policy</Link></li>
              <li><Link to="/email-abuse" className="hover:text-primary transition-colors">Email Policy</Link></li>
            </ul>
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold text-foreground">Get Started</h4>
            <Link
              to="/subscriptions"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Subscribe Now <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <p className="text-xs text-muted-foreground">
              AI-powered token intelligence starting at $0/mo
            </p>
            <button
              onClick={() => {
                localStorage.removeItem('bb_chat_dismissed_at');
                window.dispatchEvent(new CustomEvent('oracle-summon'));
              }}
              className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2 mt-2 block"
            >
              💬 Chat with The Signal
            </button>
          </div>
        </div>
        <div className="border-t border-border/40 mt-6 pt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} BlackBox Farm. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
