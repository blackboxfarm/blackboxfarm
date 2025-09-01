import { PageHeader } from "@/components/PageHeader";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <PageHeader />
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-8">Privacy Policy</h1>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-foreground">
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
            <p>BlackBox Farm collects the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Email addresses, authentication data</li>
              <li><strong>Wallet Data:</strong> Public wallet addresses, transaction histories</li>
              <li><strong>Usage Data:</strong> Platform interactions, feature usage analytics</li>
              <li><strong>Technical Data:</strong> IP addresses, browser information, device identifiers</li>
              <li><strong>Communication Data:</strong> Support requests, feedback</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
            <p>We use collected information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and maintain our services</li>
              <li>Process transactions and manage campaigns</li>
              <li>Authenticate users and prevent fraud</li>
              <li>Improve platform functionality and user experience</li>
              <li>Comply with legal obligations</li>
              <li>Communicate important updates and notifications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Information Sharing</h2>
            <p>We do not sell, trade, or otherwise transfer your personal information to third parties except:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>When required by law or legal process</li>
              <li>To protect our rights and prevent fraud</li>
              <li>With service providers who assist in platform operations</li>
              <li>In the event of a business merger or acquisition</li>
              <li>With your explicit consent</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Data Security</h2>
            <p>We implement appropriate security measures to protect your information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Encryption of sensitive data in transit and at rest</li>
              <li>Secure authentication systems</li>
              <li>Regular security audits and updates</li>
              <li>Access controls and monitoring</li>
              <li>Incident response procedures</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Blockchain Transparency</h2>
            <p>Please note that blockchain transactions are public and immutable. Once a transaction is recorded on the Solana blockchain, it cannot be deleted or modified. This includes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Transaction amounts and timestamps</li>
              <li>Wallet addresses involved</li>
              <li>Smart contract interactions</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Cookies and Tracking</h2>
            <p>We use cookies and similar technologies to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Maintain user sessions</li>
              <li>Remember user preferences</li>
              <li>Analyze platform usage</li>
              <li>Improve user experience</li>
            </ul>
            <p>You can control cookie settings through your browser preferences.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data (where legally permissible)</li>
              <li>Object to processing of your information</li>
              <li>Export your data in a portable format</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Data Retention</h2>
            <p>We retain your information for as long as necessary to provide services and comply with legal obligations. Transaction data on the blockchain is permanent and cannot be deleted.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. International Transfers</h2>
            <p>Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your data during such transfers.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Children's Privacy</h2>
            <p>BlackBox Farm is not intended for users under 18 years of age. We do not knowingly collect personal information from children under 18.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Changes to Privacy Policy</h2>
            <p>We may update this Privacy Policy periodically. Changes will be posted on this page with an updated date. Continued use of the service constitutes acceptance of the updated policy.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Contact Us</h2>
            <p>For privacy-related questions or to exercise your rights, please contact us through our official channels.</p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;