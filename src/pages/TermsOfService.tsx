import { FarmBanner } from "@/components/FarmBanner";
import { AuthButton } from "@/components/auth/AuthButton";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/hooks/useAuth";

const TermsOfService = () => {
  const { user } = useAuth();
  
  return (
    <div className="min-h-screen bg-background">
      {/* Farm Banner Header */}
      <FarmBanner />
      <div className="container mx-auto py-6 space-y-8">
        {/* Main Header Section */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-start space-y-4 md:space-y-0">
          <div className="text-center md:text-left flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              BlackBox Farm
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto md:mx-0">
              Putting the needle in the Haystack - Bumps for the whole Fam!
            </p>
            <div className="flex justify-center md:hidden space-x-3">
              <AuthButton />
            </div>
          </div>
          <div className="hidden md:flex flex-shrink-0 items-center gap-3">
            <NotificationCenter />
            <AuthButton />
          </div>
        </div>

      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-8">Terms of Service</h1>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-foreground">
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p>By accessing and using BlackBox Farm ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p>BlackBox Farm is a decentralized finance (DeFi) platform that provides tools for Solana blockchain interactions, including but not limited to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Wallet generation and management</li>
              <li>Campaign creation and management</li>
              <li>Trading and token swapping services</li>
              <li>Community wallet functionality</li>
              <li>Automated trading bots</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Risk Acknowledgment</h2>
            <p>You acknowledge and agree that:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Cryptocurrency trading involves substantial risk of loss</li>
              <li>Past performance does not guarantee future results</li>
              <li>You may lose all or part of your investment</li>
              <li>BlackBox Farm does not provide investment advice</li>
              <li>You are solely responsible for your trading decisions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. User Obligations</h2>
            <p>As a user, you agree to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your wallet and private keys</li>
              <li>Comply with all applicable laws and regulations</li>
              <li>Not use the service for illegal activities</li>
              <li>Not attempt to manipulate or exploit the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Prohibited Activities</h2>
            <p>You may not use the Service to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Engage in money laundering or terrorist financing</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe upon intellectual property rights</li>
              <li>Transmit malicious code or viruses</li>
              <li>Interfere with the operation of the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Limitation of Liability</h2>
            <p>BlackBox Farm shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your use of the Service.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Disclaimer of Warranties</h2>
            <p>The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Indemnification</h2>
            <p>You agree to indemnify and hold harmless BlackBox Farm from any claims, damages, or expenses arising from your use of the Service or violation of these Terms.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Governing Law</h2>
            <p>These Terms shall be governed by and construed in accordance with the laws of the jurisdiction where BlackBox Farm operates, without regard to conflict of law provisions.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
            <p>BlackBox Farm reserves the right to modify these Terms at any time. Changes will be effective immediately upon posting. Your continued use of the Service constitutes acceptance of the modified Terms.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
            <p>For questions about these Terms of Service, please contact us through our official channels.</p>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default TermsOfService;