import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Footer } from "@/components/Footer";
import Index from "./pages/Index";
import BumpBot from "./pages/BumpBot";
import BlackBox from "./pages/BlackBox";
import Auth from "./pages/Auth";
import { ResetPassword } from "./pages/ResetPassword";
import CompetitiveAnalysis from "./pages/CompetitiveAnalysis";
import CommunityWallet from "./pages/CommunityWallet";
import NotFound from "./pages/NotFound";
import TermsOfService from "./pages/TermsOfService";
import TOS from "./pages/TOS";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import WhitePaper from "./pages/WhitePaper";
import CookiesPolicy from "./pages/CookiesPolicy";
import EmailAbusePolicy from "./pages/EmailAbusePolicy";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";
import Web3Manifesto from "./pages/Web3Manifesto";
import SuperAdmin from "./pages/SuperAdmin";
import Demo from "./pages/Demo";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="min-h-screen flex flex-col">
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/admin" element={<Index />} />
              <Route path="/bb" element={<BumpBot />} />
              <Route path="/blackbox" element={<BlackBox />} />
              <Route path="/competitive-analysis" element={<CompetitiveAnalysis />} />
              <Route path="/community-wallet" element={<CommunityWallet />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/tos" element={<TOS />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/policy" element={<PrivacyPolicy />} />
              <Route path="/whitepaper" element={<WhitePaper />} />
              <Route path="/cookies" element={<CookiesPolicy />} />
              <Route path="/email-abuse" element={<EmailAbusePolicy />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/web3-manifesto" element={<Web3Manifesto />} />
              <Route path="/super-admin" element={<SuperAdmin />} />
              <Route path="/demo" element={<Demo />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
          <Footer />
        </BrowserRouter>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
