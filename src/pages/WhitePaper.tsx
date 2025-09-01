import { FarmBanner } from "@/components/FarmBanner";
import { AuthButton } from "@/components/auth/AuthButton";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useAuth } from "@/hooks/useAuth";

const WhitePaper = () => {
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
        <h1 className="text-4xl font-bold text-foreground mb-8">BlackBox Farm White Paper</h1>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-8 text-foreground">
          <p className="text-sm text-muted-foreground">Version 1.0 | {new Date().toLocaleDateString()}</p>
          
          <section>
            <h2 className="text-3xl font-semibold mb-4">Abstract</h2>
            <p className="text-lg leading-relaxed">BlackBox Farm represents a revolutionary approach to decentralized finance (DeFi) operations on the Solana blockchain. Our platform combines automated trading strategies, community-driven campaigns, and advanced wallet management to democratize access to sophisticated trading tools while maintaining security and transparency.</p>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">1. Introduction</h2>
            <p>The decentralized finance ecosystem has experienced explosive growth, yet accessibility to advanced trading tools remains limited to sophisticated users. BlackBox Farm bridges this gap by providing a comprehensive platform that combines:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li>Automated trading bots with customizable strategies</li>
              <li>Community-driven investment campaigns</li>
              <li>Secure wallet generation and management</li>
              <li>Real-time analytics and monitoring</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">2. Problem Statement</h2>
            <h3 className="text-xl font-medium mb-2">2.1 Complexity Barriers</h3>
            <p>Traditional DeFi platforms require extensive technical knowledge, limiting participation to experienced users. Complex interfaces and manual processes create significant barriers to entry.</p>
            
            <h3 className="text-xl font-medium mb-2 mt-4">2.2 Lack of Automation</h3>
            <p>Most retail traders lack access to sophisticated automated trading strategies, giving institutional players unfair advantages in market participation.</p>
            
            <h3 className="text-xl font-medium mb-2 mt-4">2.3 Security Concerns</h3>
            <p>Wallet management and private key security remain major obstacles for mainstream DeFi adoption, with users frequently losing funds due to poor security practices.</p>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">3. Solution Architecture</h2>
            <h3 className="text-xl font-medium mb-2">3.1 Core Components</h3>
            
            <h4 className="text-lg font-medium mb-2 mt-4">Automated Trading Engine</h4>
            <p>Our proprietary trading engine executes strategies based on:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Market analysis algorithms</li>
              <li>Risk management protocols</li>
              <li>User-defined parameters</li>
              <li>Real-time price feeds</li>
            </ul>

            <h4 className="text-lg font-medium mb-2 mt-4">Campaign Management System</h4>
            <p>Community-driven campaigns enable collective participation in trading strategies with features including:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Transparent fund allocation</li>
              <li>Automated profit distribution</li>
              <li>Real-time performance tracking</li>
              <li>Democratic governance mechanisms</li>
            </ul>

            <h4 className="text-lg font-medium mb-2 mt-4">Secure Wallet Infrastructure</h4>
            <p>Advanced wallet management provides:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Hardware-grade encryption</li>
              <li>Multi-signature capabilities</li>
              <li>Automated backup systems</li>
              <li>Recovery mechanisms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">4. Technical Implementation</h2>
            <h3 className="text-xl font-medium mb-2">4.1 Blockchain Integration</h3>
            <p>BlackBox Farm leverages Solana's high-performance blockchain for:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Low transaction costs</li>
              <li>Fast confirmation times</li>
              <li>Scalable infrastructure</li>
              <li>Advanced smart contract capabilities</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">4.2 Security Framework</h3>
            <p>Multi-layered security approach includes:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>End-to-end encryption</li>
              <li>Two-factor authentication</li>
              <li>Regular security audits</li>
              <li>Decentralized key management</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">5. Economic Model</h2>
            <h3 className="text-xl font-medium mb-2">5.1 Fee Structure</h3>
            <p>Transparent and competitive fee model:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Campaign creation fees</li>
              <li>Performance-based commissions</li>
              <li>Premium feature subscriptions</li>
              <li>Network transaction costs</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">5.2 Value Distribution</h3>
            <p>Revenue sharing model ensures sustainable ecosystem growth while rewarding participants and maintaining platform development.</p>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">6. Risk Management</h2>
            <h3 className="text-xl font-medium mb-2">6.1 Smart Contract Security</h3>
            <p>Comprehensive testing and audit procedures ensure smart contract reliability and fund protection.</p>

            <h3 className="text-xl font-medium mb-2 mt-4">6.2 Market Risk Mitigation</h3>
            <p>Built-in risk controls include position limits, stop-loss mechanisms, and diversification requirements.</p>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">7. Roadmap</h2>
            <h3 className="text-xl font-medium mb-2">Phase 1: Foundation (Q1 2024)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Core platform launch</li>
              <li>Basic trading features</li>
              <li>Wallet management system</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">Phase 2: Enhancement (Q2-Q3 2024)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Advanced trading strategies</li>
              <li>Campaign management system</li>
              <li>Community features</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">Phase 3: Expansion (Q4 2024)</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Multi-chain support</li>
              <li>Advanced analytics</li>
              <li>Mobile applications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">8. Conclusion</h2>
            <p className="text-lg leading-relaxed">BlackBox Farm represents the next evolution in DeFi accessibility, combining powerful automation with user-friendly interfaces and robust security. By democratizing access to advanced trading tools, we aim to level the playing field and enable broader participation in the decentralized finance ecosystem.</p>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">Disclaimer</h2>
            <p className="text-sm text-muted-foreground italic">This white paper is for informational purposes only and does not constitute investment advice. Cryptocurrency trading involves substantial risk of loss. Past performance does not guarantee future results.</p>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default WhitePaper;