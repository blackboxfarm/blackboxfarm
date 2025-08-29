-- Create a table for storing development ideas and tasks
CREATE TABLE IF NOT EXISTS public.development_ideas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL, -- 'core_trading', 'user_experience', 'advanced_features', 'integration', 'business_logic', 'technical'
  priority text DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status text DEFAULT 'backlog', -- 'backlog', 'in_progress', 'completed', 'cancelled'
  estimated_effort text, -- 'small', 'medium', 'large', 'extra_large'
  tags text[], -- array of tags for filtering
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone
);

-- Enable RLS on development_ideas
ALTER TABLE public.development_ideas ENABLE ROW LEVEL SECURITY;

-- Create policy for development_ideas (users can only access their own ideas)
CREATE POLICY "Users can manage their own development ideas" 
ON public.development_ideas 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create trigger for development_ideas updated_at
CREATE TRIGGER update_development_ideas_updated_at
BEFORE UPDATE ON public.development_ideas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_development_ideas_user_category ON public.development_ideas(user_id, category);
CREATE INDEX idx_development_ideas_status ON public.development_ideas(status);
CREATE INDEX idx_development_ideas_priority ON public.development_ideas(priority);
CREATE INDEX idx_development_ideas_tags ON public.development_ideas USING GIN(tags);

-- Insert the comprehensive development ideas
INSERT INTO public.development_ideas (user_id, title, description, category, priority, estimated_effort, tags) VALUES
-- Core Trading Features
(auth.uid(), 'Real-time Trading Dashboard', 'Implement real-time market data display, active positions, P&L tracking with live updates', 'core_trading', 'high', 'large', ARRAY['dashboard', 'realtime', 'trading']),
(auth.uid(), 'Campaign Management CRUD', 'Build full CRUD operations for campaigns, wallet allocation, automated trading rules', 'core_trading', 'high', 'large', ARRAY['campaigns', 'crud', 'automation']),
(auth.uid(), 'Solana Wallet Integration', 'Connect actual Solana wallets, balance checking, transaction history display', 'core_trading', 'critical', 'extra_large', ARRAY['solana', 'wallet', 'blockchain']),
(auth.uid(), 'Order Management System', 'Buy/sell execution, order history, pending orders queue with real-time updates', 'core_trading', 'high', 'large', ARRAY['orders', 'trading', 'execution']),

-- User Experience Enhancements
(auth.uid(), 'WebSocket Real-time Updates', 'WebSocket integration for live price feeds and order updates', 'user_experience', 'high', 'medium', ARRAY['websocket', 'realtime', 'performance']),
(auth.uid(), 'Advanced Notification System', 'Toast notifications for trades, alerts, security events with customizable preferences', 'user_experience', 'medium', 'medium', ARRAY['notifications', 'alerts', 'ux']),
(auth.uid(), 'Mobile Trading Optimization', 'Improve responsive design for mobile trading with touch-friendly interfaces', 'user_experience', 'medium', 'medium', ARRAY['mobile', 'responsive', 'ui']),
(auth.uid(), 'Enhanced Theme System', 'Dark/light theme with user preferences and custom color schemes', 'user_experience', 'low', 'small', ARRAY['theme', 'ui', 'customization']),

-- Advanced Trading Features
(auth.uid(), 'Visual Strategy Builder', 'Visual interface for creating trading strategies with drag-and-drop components', 'advanced_features', 'medium', 'extra_large', ARRAY['strategy', 'visual', 'automation']),
(auth.uid(), 'Risk Management Tools', 'Stop-loss, take-profit, position sizing controls with automated risk assessment', 'advanced_features', 'high', 'large', ARRAY['risk', 'automation', 'safety']),
(auth.uid(), 'Strategy Backtesting Engine', 'Historical strategy performance analysis with detailed metrics and reporting', 'advanced_features', 'medium', 'large', ARRAY['backtesting', 'analytics', 'strategy']),
(auth.uid(), 'Market Analysis Tools', 'Technical indicators, charts, market sentiment analysis with real-time data', 'advanced_features', 'medium', 'large', ARRAY['analysis', 'charts', 'indicators']),

-- Integration & APIs
(auth.uid(), 'DEX Integration (Raydium/Jupiter)', 'Real DEX connections for Raydium, Jupiter, and other Solana DEXs', 'integration', 'critical', 'extra_large', ARRAY['dex', 'solana', 'trading']),
(auth.uid(), 'Live Price Feed Integration', 'Live market data from CoinGecko, CMC, or dedicated crypto data providers', 'integration', 'high', 'medium', ARRAY['prices', 'api', 'data']),
(auth.uid(), 'Zapier Webhook System', 'Zapier integration for external notifications and automation workflows', 'integration', 'low', 'small', ARRAY['zapier', 'webhook', 'automation']),
(auth.uid(), 'Discord Bot Integration', 'Discord bots for trade alerts, portfolio updates, and community features', 'integration', 'medium', 'medium', ARRAY['discord', 'bot', 'social']),
(auth.uid(), 'Telegram Alert System', 'Telegram alerts for price movements, trade execution, and portfolio updates', 'integration', 'medium', 'small', ARRAY['telegram', 'alerts', 'notifications']),

-- Business Logic
(auth.uid(), 'Dynamic Fee Structure', 'Implement the actual 15% cheaper pricing model with transparent fee calculation', 'business_logic', 'high', 'medium', ARRAY['pricing', 'fees', 'business']),
(auth.uid(), 'Subscription Tier System', 'Different feature access levels with tiered pricing and user management', 'business_logic', 'medium', 'large', ARRAY['subscription', 'tiers', 'monetization']),
(auth.uid(), 'Analytics Dashboard', 'User behavior tracking, trading performance metrics, and business intelligence', 'business_logic', 'medium', 'large', ARRAY['analytics', 'metrics', 'tracking']),
(auth.uid(), 'KYC/AML Compliance', 'KYC/AML features for larger operations and regulatory compliance', 'business_logic', 'low', 'extra_large', ARRAY['compliance', 'kyc', 'legal']),

-- Technical Improvements
(auth.uid(), 'React Query Implementation', 'Implement React Query for data caching, synchronization, and performance optimization', 'technical', 'medium', 'medium', ARRAY['performance', 'caching', 'react']),
(auth.uid(), 'Comprehensive Testing Suite', 'Add unit tests for trading logic, integration tests, and E2E testing', 'technical', 'high', 'large', ARRAY['testing', 'quality', 'automation']),
(auth.uid(), 'Error Monitoring Setup', 'Error tracking with Sentry or similar for production monitoring and debugging', 'technical', 'medium', 'small', ARRAY['monitoring', 'errors', 'production']),
(auth.uid(), 'API Documentation', 'Comprehensive API docs and user guides for developers and end users', 'technical', 'low', 'medium', ARRAY['documentation', 'api', 'guides']),

-- Immediate Priority Tasks
(auth.uid(), 'Campaign Dashboard - Real Data', 'Make Campaign Dashboard show real data and functionality instead of placeholder content', 'core_trading', 'critical', 'large', ARRAY['dashboard', 'immediate', 'data']),
(auth.uid(), 'Security Tab Enhancement', 'Complete the Security Dashboard with additional monitoring and alert features', 'technical', 'high', 'medium', ARRAY['security', 'dashboard', 'monitoring']),
(auth.uid(), 'Wallet Balance Display', 'Show real wallet balances and transaction history in the interface', 'core_trading', 'high', 'medium', ARRAY['wallet', 'balance', 'ui']);