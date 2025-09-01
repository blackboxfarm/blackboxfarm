import { FarmBanner } from "@/components/FarmBanner";
import { AuthButton } from "@/components/auth/AuthButton";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const CookiesPolicy = () => {
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
          <h1 className="text-4xl font-bold text-foreground">Cookies Policy</h1>
        </div>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6 text-foreground">
          <p className="text-sm text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <section>
            <h2 className="text-2xl font-semibold mb-4">What Are Cookies</h2>
            <p>Cookies are small text files that are stored on your device when you visit BlackBox Farm. They help us provide you with a better experience by remembering your preferences and enabling certain functionality.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">How We Use Cookies</h2>
            <p>BlackBox Farm uses cookies for the following purposes:</p>
            
            <h3 className="text-xl font-medium mb-2 mt-4">Essential Cookies</h3>
            <p>These cookies are necessary for the platform to function properly:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Authentication:</strong> To keep you logged in and secure</li>
              <li><strong>Security:</strong> To protect against fraud and unauthorized access</li>
              <li><strong>Session Management:</strong> To maintain your session state</li>
              <li><strong>Load Balancing:</strong> To distribute traffic efficiently</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">Functional Cookies</h3>
            <p>These cookies enhance your experience on our platform:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Preferences:</strong> To remember your settings and preferences</li>
              <li><strong>Language:</strong> To display content in your preferred language</li>
              <li><strong>Theme:</strong> To remember your dark/light mode preference</li>
              <li><strong>Wallet Connections:</strong> To remember your wallet preferences</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">Analytics Cookies</h3>
            <p>These cookies help us understand how users interact with our platform:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Usage Analytics:</strong> To understand which features are most popular</li>
              <li><strong>Performance Monitoring:</strong> To identify and fix technical issues</li>
              <li><strong>User Journey:</strong> To improve the user experience</li>
              <li><strong>Error Tracking:</strong> To monitor and resolve platform errors</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Types of Cookies We Use</h2>
            
            <h3 className="text-xl font-medium mb-2">Session Cookies</h3>
            <p>These are temporary cookies that are deleted when you close your browser. They help maintain your session while using BlackBox Farm.</p>

            <h3 className="text-xl font-medium mb-2 mt-4">Persistent Cookies</h3>
            <p>These cookies remain on your device for a specified period or until you delete them. They help remember your preferences between visits.</p>

            <h3 className="text-xl font-medium mb-2 mt-4">First-Party Cookies</h3>
            <p>These are cookies set directly by BlackBox Farm to enhance your experience on our platform.</p>

            <h3 className="text-xl font-medium mb-2 mt-4">Third-Party Cookies</h3>
            <p>These are cookies set by external services we use, such as analytics providers or security services.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Managing Your Cookie Preferences</h2>
            
            <h3 className="text-xl font-medium mb-2">Browser Settings</h3>
            <p>You can control and manage cookies through your browser settings:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Chrome:</strong> Settings → Privacy and Security → Cookies and other site data</li>
              <li><strong>Firefox:</strong> Settings → Privacy & Security → Cookies and Site Data</li>
              <li><strong>Safari:</strong> Preferences → Privacy → Cookies and website data</li>
              <li><strong>Edge:</strong> Settings → Cookies and site permissions → Cookies and site data</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">Platform Settings</h3>
            <p>You can also manage certain cookie preferences directly within BlackBox Farm through your account settings.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Cookie Retention</h2>
            <p>Different cookies have different retention periods:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Session cookies:</strong> Deleted when you close your browser</li>
              <li><strong>Preference cookies:</strong> Typically retained for 1 year</li>
              <li><strong>Analytics cookies:</strong> Usually retained for 2 years</li>
              <li><strong>Security cookies:</strong> Vary based on security requirements</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Impact of Disabling Cookies</h2>
            <p>If you choose to disable cookies, some features of BlackBox Farm may not function properly:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>You may need to log in repeatedly</li>
              <li>Your preferences may not be saved</li>
              <li>Some security features may not work</li>
              <li>The platform may not perform optimally</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Updates to This Policy</h2>
            <p>We may update this Cookies Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. We will notify users of any material changes.</p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
            <p>If you have any questions about our use of cookies or this Cookies Policy, please contact us through our official channels.</p>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default CookiesPolicy;