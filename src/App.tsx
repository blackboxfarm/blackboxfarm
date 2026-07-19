import React, { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmergencyStopButton } from "@/components/EmergencyStopButton";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Footer } from "@/components/Footer";
import { ScrollToTop } from "@/components/ScrollToTop";
import { PageLoader } from "@/components/ui/lazy-loader";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserRolesProvider } from "@/contexts/UserRolesContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { useDomainRedirect } from "@/hooks/useDomainRedirect";
import { SuperAdminRoute } from "@/components/guards/SuperAdminRoute";
import { JourneyTrackerProvider } from "@/components/JourneyTrackerProvider";
import { TesterFeedbackWidget } from "@/components/tester/TesterFeedbackWidget";

// Lazy load all pages for code splitting
const Home = lazy(() => import("./pages/Home"));
const BlackBox = lazy(() => import("./pages/BlackBox"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
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
const PhanesBatch = lazy(() => import("./pages/admin/PhanesBatch"));
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
const Wtf = lazy(() => import("./pages/Wtf"));
const InsidersRecaps = lazy(() => import("./pages/InsidersRecaps"));

const IntelReport = lazy(() => import("./pages/IntelReport"));
const HoldersLanding = lazy(() => import("./pages/HoldersLanding"));
const HoldersBotLanding = lazy(() => import("./pages/HoldersBotLanding"));
const Security = lazy(() => import("./pages/Security"));
const ApiLanding = lazy(() => import("./pages/ApiLanding"));
const ApiDocsLanding = lazy(() => import("./pages/ApiDocsLanding"));
const AIAnalysis = lazy(() => import("./pages/AIAnalysis"));
const Socials = lazy(() => import("./pages/Socials"));
const Oracle = lazy(() => import("./pages/Oracle"));
const BankerPool = lazy(() => import("./pages/BankerPool"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Subscriptions = lazy(() => import("./pages/Subscriptions"));
const TelegramBot = lazy(() => import("./pages/TelegramBot"));
const Features = lazy(() => import("./pages/Features"));
const BubblePromo = lazy(() => import("./pages/BubblePromo"));
const BubbleMapPage = lazy(() => import("./pages/BubbleMap"));
const TesterFeedbackPage = lazy(() => import("./pages/TesterFeedback"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const HoldersHowTo = lazy(() => import("./pages/HoldersHowTo"));
const BubblesHowTo = lazy(() => import("./pages/BubblesHowTo"));
const TestimonialSubmit = lazy(() => import("./pages/TestimonialSubmit"));
const Feed = lazy(() => import("./pages/Feed"));
const IntelBriefings = lazy(() => import("./pages/IntelBriefings"));
const IntelBriefingArticle = lazy(() => import("./pages/IntelBriefingArticle"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const TokenAction = lazy(() => import("./pages/TokenAction"));
const TelegramAuth = lazy(() => import("./pages/TelegramAuth"));
const Autopsies = lazy(() => import("./pages/Autopsies"));
const AutopsyArticle = lazy(() => import("./pages/AutopsyArticle"));
const AutopsyRaw = lazy(() => import("./pages/AutopsyRaw"));
const TokenArchive = lazy(() => import("./pages/TokenArchive"));
const TwilioIdeas = lazy(() => import("./pages/TwilioIdeas"));
const NoLube = lazy(() => import("./pages/NoLube"));
// AutopsyQueue page removed — Autopsies admin lives inside the Super Admin Autopsies tab.

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
              
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <JourneyTrackerProvider />
                <ScrollToTop />
                <div className="flex-1">
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/wtf" element={<Wtf />} />
                      <Route path="/onboarding" element={<Onboarding />} />
                      <Route path="/auth" element={<Auth />} />
                      <Route path="/admin" element={<SuperAdminRoute><Navigate to="/super-admin" replace /></SuperAdminRoute>} />
                      <Route path="/bb" element={<SuperAdminRoute><BumpBot /></SuperAdminRoute>} />
                      <Route path="/blackbox" element={<BlackBox />} />
                      <Route path="/competitive-analysis" element={<CompetitiveAnalysis />} />
                      <Route path="/community-wallet" element={<SuperAdminRoute><CommunityWallet /></SuperAdminRoute>} />
                      <Route path="/reset-password" element={<ResetPassword />} />
                      <Route path="/verify-email" element={<VerifyEmail />} />
                      <Route path="/unsubscribe" element={<Unsubscribe />} />
                      <Route path="/action" element={<TokenAction />} />
                      <Route path="/auth/tg" element={<TelegramAuth />} />
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
                      <Route path="/twilio-ideas" element={<TwilioIdeas />} />
                      <Route path="/nolube" element={<SuperAdminRoute><NoLube /></SuperAdminRoute>} />
                      <Route path="/super-admin/phanes-batch" element={<SuperAdminRoute><PhanesBatch /></SuperAdminRoute>} />
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
                      
                      <Route path="/holders-info" element={<HoldersLanding />} />
                      <Route path="/holders-bot" element={<HoldersBotLanding />} />
                      <Route path="/security" element={<Security />} />
                      <Route path="/api" element={<ApiLanding />} />
                      <Route path="/api-docs" element={<ApiDocsLanding />} />
                      <Route path="/ai-analysis" element={<SiteLayout><AIAnalysis /></SiteLayout>} />
                      <Route path="/socials" element={<SuperAdminRoute><Socials /></SuperAdminRoute>} />
                      <Route path="/oracle" element={<SuperAdminRoute><Oracle /></SuperAdminRoute>} />
                      <Route path="/banker-pool" element={<SuperAdminRoute><BankerPool /></SuperAdminRoute>} />
                      <Route path="/intel/report/:address" element={<IntelReport />} />
                      <Route path="/pricing" element={<Pricing />} />
                      <Route path="/subscriptions" element={<Subscriptions />} />
                      <Route path="/tgbot" element={<TelegramBot />} />
                      <Route path="/features" element={<Features />} />
                      <Route path="/bubblepromo" element={<BubblePromo />} />
                      <Route path="/bubblemap" element={<SiteLayout><BubbleMapPage /></SiteLayout>} />
                      <Route path="/bubblemaps" element={<Navigate to="/bubblemap" replace />} />
                      <Route path="/holders-how-to" element={<HoldersHowTo />} />
                      <Route path="/bubbles-how-to" element={<BubblesHowTo />} />
                      <Route path="/testimonial-submit" element={<TestimonialSubmit />} />
                      <Route path="/feed" element={<Feed />} />
                      <Route path="/intel" element={<IntelBriefings />} />
                      <Route path="/intel/briefing/:slug" element={<IntelBriefingArticle />} />
                      <Route path="/autopsy" element={<Autopsies />} />
                      <Route path="/autopsy/:slug/raw" element={<AutopsyRaw />} />
                      <Route path="/autopsy/:slug" element={<AutopsyArticle />} />
                      {/* Legacy admin route → bounce to Super Admin Autopsies tab */}
                      <Route path="/super-admin/autopsy-queue" element={<Navigate to="/super-admin?tab=autopsies" replace />} />
                      <Route path="/tester" element={<TesterFeedbackPage />} />
                      <Route path="/token-archive" element={<TokenArchive />} />
                      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </div>
                <TesterFeedbackWidget />
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
