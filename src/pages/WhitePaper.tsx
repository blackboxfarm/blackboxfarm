import { SiteLayout } from "@/components/layout/SiteLayout";

const WhitePaper = () => {
  return (
    <SiteLayout>
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold text-foreground mb-2">BlackBox Farm — Technical White Paper</h1>
        <p className="text-sm text-muted-foreground mb-10">Version 2.0 | March 2025</p>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-10 text-foreground">

          <section>
            <h2 className="text-3xl font-semibold mb-4">Abstract</h2>
            <p className="text-lg leading-relaxed">
              BlackBox Farm is an AI-powered on-chain intelligence platform built on Solana. It combines automated holder analysis, 
              developer reputation profiling, wallet family graph mapping, and multi-source token discovery to provide traders with 
              actionable intelligence on memecoins and emerging tokens. The platform surfaces insider activity, bundle detection, 
              and developer track records — information previously accessible only to sophisticated on-chain analysts.
            </p>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">1. Problem Statement</h2>
            <p>The Solana memecoin ecosystem generates thousands of new token launches daily. Traders face systemic information asymmetry:</p>
            <ul className="list-disc pl-6 space-y-2 mt-4">
              <li><strong>Bundled Supply</strong> — Developers distribute tokens across dozens of wallets to disguise insider holdings, making tokens appear more distributed than they are.</li>
              <li><strong>Wallet Recycling</strong> — Bad actors deploy from fresh wallets while funneling profits back to the same master wallets, evading simple wallet checks.</li>
              <li><strong>Channel Recycling</strong> — The same Telegram groups and X accounts are used to promote successive rug pulls, building fake social proof each time.</li>
              <li><strong>CTO Manipulation</strong> — "Community Takeover" narratives are manufactured by insiders who retain hidden supply positions.</li>
              <li><strong>Data Fragmentation</strong> — The on-chain data to detect all of the above exists, but requires cross-referencing multiple sources (Helius, DexScreener, Pump.fun, Telegram) in real time.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">2. Platform Architecture</h2>
            
            <h3 className="text-xl font-medium mb-2">2.1 AI Holder Analysis Engine</h3>
            <p>The core product — accessible at <code>/holders</code> — takes any Solana token mint address and produces a comprehensive holder intelligence report:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Top holder distribution with wallet age and transaction history</li>
              <li>Bundle detection via funding source clustering</li>
              <li>Insider wallet identification through timing and size analysis</li>
              <li>GPT-powered narrative summary with risk assessment score</li>
              <li>Historical holder snapshots for trend analysis</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-6">2.2 Developer Reputation System</h3>
            <p>Every token creator is profiled with a persistent identity across launches:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Developer Profiles</strong> — Launch history, best/worst performing tokens, associated wallets</li>
              <li><strong>Reputation Mesh</strong> — Graph database linking wallets by funding relationships, co-minting patterns, and profit flows</li>
              <li><strong>AllStar Registry</strong> — Tiered ranking (T1–T8) for developers whose tokens achieve significant market caps ($100K+ ATH)</li>
              <li><strong>Wallet Family Engine</strong> — Automated discovery of related wallets using relationship scoring: direct funding (+40), co-minting (+25), profit returns (+20), CEX gateways</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-6">2.3 Token Discovery Pipeline</h3>
            <p>Multi-source ingestion ensures comprehensive market coverage:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>DexScreener Top 200</strong> — Scraped every 30 minutes, tracking rank changes, boosts, and ATH progression</li>
              <li><strong>Telegram Monitor</strong> — Ingests calls from tracked alpha channels with deduplication</li>
              <li><strong>Pump.fun API</strong> — Monitors new token deployments from tracked developer wallets</li>
              <li><strong>Helius RPC</strong> — Watches for <code>initializeMint</code> instructions from wallet family members</li>
              <li><strong>Bot DMs</strong> — Accepts token submissions via Telegram bot with automated analysis</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-6">2.4 Automated Publishing</h3>
            <p>The <strong>@HoldersIntel</strong> X account is powered by an automated pipeline:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Tokens pass through a post queue with status tracking (New → Queued → Posted)</li>
              <li>AI-generated analysis images are composited with holder data</li>
              <li>Automated posting with attribution tracking per discovery source</li>
              <li>Reconciliation engine syncs post status from X API</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">3. Intelligence Systems</h2>
            
            <h3 className="text-xl font-medium mb-2">3.1 Wallet Family Surveillance Engine</h3>
            <p>A graph-based discovery and monitoring system that clusters developer wallets into families:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Relationship types: Seed, Parent, Sibling, Child, CEX Gateway</li>
              <li>Tiered polling: 5–15 minute intervals with "Burst Mode" (60s polling for 10 minutes) triggered by mint detection</li>
              <li>Automatic cross-feeding into reputation_mesh, pumpfun_watchlist, and allstar_dev_registry</li>
              <li>Interactive family graph visualization powered by React Flow</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-6">3.2 AllStar Promotion Engine</h3>
            <p>Automated identification and tracking of high-performing developers:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Scans token_lifecycle for tokens achieving ATH ≥ $100K</li>
              <li>Tier assignment: $100K→T1, $250K→T2, $500K→T3, $1M→T4, $5M→T5, $10M→T6</li>
              <li>Auto-seeds wallet family surveillance for qualifying developers</li>
              <li>Telegram alerts broadcast to BLACKBOX group on promotions</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-6">3.3 Mint Alert System</h3>
            <p>Real-time detection when tracked developers launch new tokens:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Monitors all wallets in expanded wallet families</li>
              <li>Alert levels based on developer tier and wallet depth</li>
              <li>Notifications via Telegram with full context (tier, best previous token, ATH)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">4. Technical Stack</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Frontend</strong> — React + TypeScript + Tailwind CSS + shadcn/ui</li>
              <li><strong>Backend</strong> — Supabase (PostgreSQL, Edge Functions, Auth, Storage, Realtime)</li>
              <li><strong>Blockchain</strong> — Solana via @solana/web3.js, Helius RPC, Pump.fun API</li>
              <li><strong>AI/ML</strong> — OpenAI GPT-4 for holder analysis narratives and risk scoring</li>
              <li><strong>Data Sources</strong> — DexScreener API, Helius, BirdEye, Jupiter, CoinGecko</li>
              <li><strong>Automation</strong> — Supabase cron jobs, Telegram Bot API, X API v2</li>
              <li><strong>Visualization</strong> — Recharts, React Flow (wallet family graphs), react-force-graph-2d (bubble maps)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">5. Business Model</h2>
            <h3 className="text-xl font-medium mb-2">5.1 Revenue Streams</h3>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Subscription Tiers</strong> — Free (limited scans), Pro (unlimited analysis), Enterprise (API access)</li>
              <li><strong>Banner Advertising</strong> — Self-serve banner placements on holder analysis pages, paid in SOL (24hr: $40, 48hr: $70, 72hr: $100, 1 Week: $175)</li>
              <li><strong>Telegram Bot Premium</strong> — Enhanced features and priority analysis queue</li>
              <li><strong>API Access</strong> — Programmatic access to holder analysis and developer profiles</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-6">5.2 Token Discovery Monetization</h3>
            <p>Promoted token placements and featured analysis reports provide non-intrusive revenue while maintaining editorial independence of the intelligence layer.</p>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">6. Roadmap</h2>
            
            <h3 className="text-xl font-medium mb-2">Phase 1: Intelligence Foundation ✅</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>AI Holder Analysis engine with GPT-powered reports</li>
              <li>Developer reputation profiling and AllStar registry</li>
              <li>DexScreener Top 200 auto-ingestion pipeline</li>
              <li>@HoldersIntel automated X posting</li>
              <li>Wallet family surveillance engine</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">Phase 2: Scale & Monetize 🔄</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Self-serve banner advertising with SOL payments</li>
              <li>Subscription tiers with Stripe integration</li>
              <li>Telegram bot premium features</li>
              <li>API access for third-party integrations</li>
              <li>X post reconciliation from API</li>
            </ul>

            <h3 className="text-xl font-medium mb-2 mt-4">Phase 3: Network Effects 🔮</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li>Community-contributed wallet family tips</li>
              <li>Cross-chain expansion (Base, Ethereum memecoins)</li>
              <li>Mobile app with push notifications for mint alerts</li>
              <li>Machine learning model for rug prediction scoring</li>
              <li>DAO governance for platform development priorities</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">7. Security & Privacy</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>All private keys encrypted at rest with Supabase vault</li>
              <li>Row-level security on all database tables</li>
              <li>Role-based access control with security definer functions</li>
              <li>No user wallet connections required for analysis (read-only on-chain data)</li>
              <li>Rate limiting and fingerprinting to prevent abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-3xl font-semibold mb-4">Disclaimer</h2>
            <p className="text-sm text-muted-foreground italic">
              This white paper is for informational purposes only and does not constitute investment advice. 
              BlackBox Farm provides on-chain intelligence tools — trading decisions remain the sole responsibility of the user. 
              Cryptocurrency markets involve substantial risk. Past developer performance does not guarantee future results.
            </p>
          </section>
        </div>
      </div>
    </SiteLayout>
  );
};

export default WhitePaper;
