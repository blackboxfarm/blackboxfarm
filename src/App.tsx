import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import BumpBot from "./pages/BumpBot";
import BlackBox from "./pages/BlackBox";
import Auth from "./pages/Auth";
import { ResetPassword } from "./pages/ResetPassword";
import CompetitiveAnalysis from "./pages/CompetitiveAnalysis";
import CommunityWallet from "./pages/CommunityWallet";
import NotFound from "./pages/NotFound";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import WhitePaper from "./pages/WhitePaper";
import CookiesPolicy from "./pages/CookiesPolicy";
import EmailAbusePolicy from "./pages/EmailAbusePolicy";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
              <div className="text-center">
                <h1 className="text-4xl font-bold text-primary mb-4">BlackBox Farm</h1>
                <p className="text-xl text-muted-foreground mb-8">Loading...</p>
                <div className="space-y-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <p className="text-sm text-muted-foreground">If this loading persists, please refresh the page</p>
                </div>
              </div>
            </div>
          } />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Index />} />
          <Route path="/bb" element={<BumpBot />} />
          <Route path="/blackbox" element={<BlackBox />} />
          <Route path="/competitive-analysis" element={<CompetitiveAnalysis />} />
          <Route path="/community-wallet" element={<CommunityWallet />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/tos" element={<TermsOfService />} />
          <Route path="/policy" element={<PrivacyPolicy />} />
          <Route path="/whitepaper" element={<WhitePaper />} />
          <Route path="/cookies" element={<CookiesPolicy />} />
          <Route path="/email-abuse" element={<EmailAbusePolicy />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
