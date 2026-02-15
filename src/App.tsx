import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmergencyStopButton } from "@/components/EmergencyStopButton";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PageLoader } from "@/components/ui/lazy-loader";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserRolesProvider } from "@/contexts/UserRolesContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { useDomainRedirect } from "@/hooks/useDomainRedirect";
import { SuperAdminRoute } from "@/components/guards/SuperAdminRoute";

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
const MyBanners = lazy(() => import("./pages/MyBanners"));
const TokenAnalysisDownload = lazy(() => import("./pages/TokenAnalysisDownload"));
const ShareCardDemoPage = lazy(() => import("./pages/ShareCardDemo"));
const BumpBotLanding = lazy(() => import("./pages/BumpBotLanding"));
const VolumeBotLanding = lazy(() => import("./pages/VolumeBotLanding"));
const HoldersLanding = lazy(() => import("./pages/HoldersLanding"));
const HoldersBotLanding = lazy(() => import("./pages/HoldersBotLanding"));
const Security = lazy(() => import("./pages/Security"));
const ApiLanding = lazy(() => import("./pages/ApiLanding"));
const ApiDocsLanding = lazy(() => import("./pages/ApiDocsLanding"));
const AIAnalysis = lazy(() => import("./pages/AIAnalysis"));
const Socials = lazy(() => import("./pages/Socials"));
const Oracle = lazy(() => import("./pages/Oracle"));
const BankerPool = lazy(() => import("./pages/BankerPool"));

const queryClient = new QueryClient();

const App = () => {
  useDomainRedirect(); // Redirect lovable.app → blackbox.farm
  
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <UserRolesProvider>
        <NotificationsProvider>
          <TooltipProvider>
            <div className="min-h-screen flex flex-col">
              {/* Intel XBot controls moved to /share-card-demo */}
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <ScrollToTop />
                <div className="flex-1">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<BlackBox />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/admin" element={<SuperAdminRoute><Index /></SuperAdminRoute>} />
                      <Route path="/bb" element={<SuperAdminRoute><BumpBot /></SuperAdminRoute>} />
                      <Route path="/blackbox" element={<BlackBox />} />
                      <Route path="/competitive-analysis" element={<CompetitiveAnalysis />} />
                      <Route path="/community-wallet" element={<SuperAdminRoute><CommunityWallet /></SuperAdminRoute>} />
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
                      <Route path="/my-banners" element={<MyBanners />} />
                      <Route path="/banner-checkout/:orderId" element={<BannerCheckout />} />
                      <Route path="/banner-preview/:orderId" element={<BannerPreview />} />
                      <Route path="/copy-trading" element={<SuperAdminRoute><CopyTrading /></SuperAdminRoute>} />
                      <Route path="/breadcrumbs" element={<SuperAdminRoute><BreadCrumbs /></SuperAdminRoute>} />
                      <Route path="/helius-usage" element={<SuperAdminRoute><HeliusUsage /></SuperAdminRoute>} />
                      <Route path="/token-analysis" element={<SuperAdminRoute><TokenAnalysisDownload /></SuperAdminRoute>} />
                      <Route path="/share-card-demo" element={<SuperAdminRoute><ShareCardDemoPage /></SuperAdminRoute>} />
                      <Route path="/bumpbot" element={<BumpBotLanding />} />
                      <Route path="/volumebot" element={<VolumeBotLanding />} />
                      <Route path="/holders-info" element={<HoldersLanding />} />
                      <Route path="/holders-bot" element={<HoldersBotLanding />} />
                      <Route path="/security" element={<Security />} />
                      <Route path="/api" element={<ApiLanding />} />
                      <Route path="/api-docs" element={<ApiDocsLanding />} />
                      <Route path="/ai-analysis" element={<AIAnalysis />} />
                      <Route path="/socials" element={<SuperAdminRoute><Socials /></SuperAdminRoute>} />
                      <Route path="/oracle" element={<SuperAdminRoute><Oracle /></SuperAdminRoute>} />
                      <Route path="/banker-pool" element={<SuperAdminRoute><BankerPool /></SuperAdminRoute>} />
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
};

export default App;
