import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PageLoader } from "@/components/ui/lazy-loader";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserRolesProvider } from "@/contexts/UserRolesContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";

// Lazy load all pages for code splitting
const BlackBox = lazy(() => import("./pages/BlackBox"));
const Index = lazy(() => import("./pages/Index"));
const BumpBot = lazy(() => import("./pages/BumpBot"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword").then(m => ({ default: m.ResetPassword })));
const CompetitiveAnalysis = lazy(() => import("./pages/CompetitiveAnalysis"));
const CommunityWallet = lazy(() => import("./pages/CommunityWallet"));
const NotFound = lazy(() => import("./pages/NotFound"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const TOS = lazy(() => import("./pages/TOS"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const WhitePaper = lazy(() => import("./pages/WhitePaper"));
const CookiesPolicy = lazy(() => import("./pages/CookiesPolicy"));
const EmailAbusePolicy = lazy(() => import("./pages/EmailAbusePolicy"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const Web3Manifesto = lazy(() => import("./pages/Web3Manifesto"));
const SuperAdmin = lazy(() => import("./pages/SuperAdmin"));
const Developer = lazy(() => import("./pages/Developer"));
const Demo = lazy(() => import("./pages/Demo"));
const Holders = lazy(() => import("./pages/Holders"));
const HoldersMarketing = lazy(() => import("./pages/HoldersMarketing"));
const Adverts = lazy(() => import("./pages/Adverts"));
const CopyTrading = lazy(() => import("./pages/CopyTrading"));
const BreadCrumbs = lazy(() => import("./pages/BreadCrumbs"));
const HeliusUsage = lazy(() => import("./pages/HeliusUsage"));
const BuyBanner = lazy(() => import("./pages/BuyBanner"));
const BannerCheckout = lazy(() => import("./pages/BannerCheckout"));
const BannerPreview = lazy(() => import("./pages/BannerPreview"));
const TokenAnalysisDownload = lazy(() => import("./pages/TokenAnalysisDownload"));
const ShareCardDemoPage = lazy(() => import("./pages/ShareCardDemo"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <UserRolesProvider>
        <NotificationsProvider>
          <TooltipProvider>
            <div className="min-h-screen flex flex-col">
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <ScrollToTop />
                <div className="flex-1">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<BlackBox />} />
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
                      <Route path="/developer/:walletAddress" element={<Developer />} />
                      <Route path="/demo" element={<Demo />} />
                      <Route path="/holders" element={<Holders />} />
                      <Route path="/holders-marketing" element={<HoldersMarketing />} />
                      <Route path="/adverts" element={<Adverts />} />
                      <Route path="/buy-banner" element={<BuyBanner />} />
                      <Route path="/banner-checkout/:orderId" element={<BannerCheckout />} />
                      <Route path="/banner-preview/:orderId" element={<BannerPreview />} />
                      <Route path="/copy-trading" element={<CopyTrading />} />
                      <Route path="/breadcrumbs" element={<BreadCrumbs />} />
                      <Route path="/helius-usage" element={<HeliusUsage />} />
                      <Route path="/token-analysis" element={<TokenAnalysisDownload />} />
                      <Route path="/share-card-demo" element={<ShareCardDemoPage />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </div>
                <Footer />
              </BrowserRouter>
            </div>
          </TooltipProvider>
        </NotificationsProvider>
      </UserRolesProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
