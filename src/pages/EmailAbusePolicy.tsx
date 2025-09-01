import { FarmBanner } from "@/components/FarmBanner";
import { AuthButton } from "@/components/auth/AuthButton";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const EmailAbusePolicy = () => {
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
        <div className="flex items-center gap-4 mb-8">
          <Link to="/" className="hover:opacity-80 transition-opacity">
            <ArrowLeft className="h-10 w-10 text-primary" strokeWidth={3} />
          </Link>
          <h1 className="text-4xl font-bold text-foreground">Email Abuse Policy</h1>
        </div>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-foreground">
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Policy Overview</h2>
            <p>BlackBox Farm is committed to responsible email practices and maintaining the integrity of our communication systems. This Email Abuse Policy outlines our standards for email usage and the consequences for violations.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Prohibited Email Activities</h2>
            <p>The following activities are strictly prohibited when using BlackBox Farm's email services:</p>
            
            <h3 className="text-xl font-medium mb-2 mt-4">2.1 Spam and Unsolicited Emails</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Sending bulk unsolicited commercial emails</li>
              <li>Distributing emails without proper consent</li>
              <li>Using purchased or harvested email lists</li>
              <li>Sending emails with misleading subject lines</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">2.2 Malicious Content</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Distributing malware, viruses, or harmful code</li>
              <li>Phishing attempts or fraudulent schemes</li>
              <li>Social engineering attacks</li>
              <li>Identity theft or impersonation</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">2.3 Harassment and Abuse</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Sending threatening or intimidating messages</li>
              <li>Harassment based on race, gender, religion, or other characteristics</li>
              <li>Stalking or persistent unwanted contact</li>
              <li>Distributing defamatory content</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">2.4 Illegal Activities</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Promoting illegal activities or services</li>
              <li>Money laundering schemes</li>
              <li>Drug trafficking or illegal substance sales</li>
              <li>Copyright infringement</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Legitimate Email Usage</h2>
            <p>BlackBox Farm sends emails for the following legitimate purposes:</p>
            
            <h3 className="text-xl font-medium mb-2 mt-4">3.1 Transactional Emails</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Account registration confirmations</li>
              <li>Password reset requests</li>
              <li>Two-factor authentication codes</li>
              <li>Transaction confirmations</li>
              <li>Security alerts</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">3.2 Operational Communications</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Campaign notifications (when explicitly requested)</li>
              <li>System maintenance announcements</li>
              <li>Policy updates and important notices</li>
              <li>Customer support responses</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">3.3 Marketing Communications</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Newsletter subscriptions (opt-in only)</li>
              <li>Product updates and feature announcements</li>
              <li>Educational content about DeFi and trading</li>
              <li>Promotional offers (with proper consent)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Consent and Opt-Out</h2>
            
            <h3 className="text-xl font-medium mb-2">4.1 Consent Requirements</h3>
            <p>We obtain consent for marketing emails through:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Explicit opt-in during registration</li>
              <li>Confirmed opt-in via email verification</li>
              <li>Clear disclosure of email purposes</li>
              <li>Separate consent for different email types</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">4.2 Unsubscribe Process</h3>
            <p>All marketing emails include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Clear unsubscribe links</li>
              <li>One-click unsubscribe functionality</li>
              <li>Processing within 48 hours</li>
              <li>Confirmation of unsubscription</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Monitoring and Detection</h2>
            <p>BlackBox Farm employs various measures to detect and prevent email abuse:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Automated spam detection systems</li>
              <li>Reputation monitoring services</li>
              <li>Complaint tracking and analysis</li>
              <li>Regular security audits</li>
              <li>User reporting mechanisms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Consequences of Violations</h2>
            <p>Violations of this Email Abuse Policy may result in:</p>
            
            <h3 className="text-xl font-medium mb-2 mt-4">6.1 Immediate Actions</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Suspension of email privileges</li>
              <li>Account restrictions or suspension</li>
              <li>Removal of offending content</li>
              <li>IP address blocking</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">6.2 Escalated Measures</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li>Permanent account termination</li>
              <li>Legal action for severe violations</li>
              <li>Reporting to law enforcement</li>
              <li>Cooperation with ISPs and email providers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Reporting Email Abuse</h2>
            <p>To report email abuse or violations of this policy:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Forward the offending email to our abuse team</li>
              <li>Include full email headers when reporting</li>
              <li>Provide detailed description of the violation</li>
              <li>Include any relevant supporting evidence</li>
            </ul>
            <p className="mt-4">We investigate all reports promptly and take appropriate action.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Compliance and Standards</h2>
            <p>BlackBox Farm adheres to industry standards and regulations:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>CAN-SPAM Act compliance (US)</li>
              <li>GDPR email requirements (EU)</li>
              <li>CASL compliance (Canada)</li>
              <li>Industry best practices for email security</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Appeal Process</h2>
            <p>If you believe your account was wrongly restricted due to alleged email abuse:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Submit an appeal through our official channels</li>
              <li>Provide evidence supporting your claim</li>
              <li>Allow up to 7 business days for review</li>
              <li>Await our response before taking further action</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Policy Updates</h2>
            <p>This Email Abuse Policy may be updated periodically to reflect changes in technology, regulations, or business practices. Users will be notified of significant changes through appropriate channels.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
            <p>For questions about this Email Abuse Policy or to report violations, please contact us through our official support channels.</p>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default EmailAbusePolicy;