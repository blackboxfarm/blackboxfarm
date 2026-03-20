
-- Known CEX hot wallets lookup table
CREATE TABLE public.known_cex_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  cex_name TEXT NOT NULL,
  cex_label TEXT,
  chain TEXT NOT NULL DEFAULT 'solana',
  is_verified BOOLEAN NOT NULL DEFAULT true,
  added_by TEXT DEFAULT 'seed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_known_cex_wallets_address ON public.known_cex_wallets(wallet_address);
CREATE INDEX idx_known_cex_wallets_cex ON public.known_cex_wallets(cex_name);

ALTER TABLE public.known_cex_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read known CEX wallets"
ON public.known_cex_wallets FOR SELECT USING (true);

CREATE POLICY "Super admins can insert CEX wallets"
ON public.known_cex_wallets FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update CEX wallets"
ON public.known_cex_wallets FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete CEX wallets"
ON public.known_cex_wallets FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.known_cex_wallets (wallet_address, cex_name, cex_label) VALUES
('2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S', 'Binance', 'Binance Hot Wallet 1'),
('5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9', 'Binance', 'Binance Hot Wallet 2'),
('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM', 'Binance', 'Binance Hot Wallet 3'),
('3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E', 'Binance', 'Binance Deposit'),
('BmFdpraQhkiDQE6SnfG5PVw28XZ2LYna1YLkBMZFSVaH', 'Binance', 'Binance Hot Wallet 4'),
('GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE', 'Coinbase', 'Coinbase Hot Wallet 1'),
('H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS', 'Coinbase', 'Coinbase Prime'),
('2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm', 'Coinbase', 'Coinbase Commerce'),
('5VCwKtCXgCDuQosrzGRDzuoMGH7YuPHdeZkEM8UDHt7D', 'OKX', 'OKX Hot Wallet 1'),
('ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ', 'OKX', 'OKX Hot Wallet 2'),
('AC5RDfQFmDS1deWZos921JfqscXdByf6BKHAbBsMnQMn', 'Bybit', 'Bybit Hot Wallet 1'),
('FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiWB5o', 'Kraken', 'Kraken Hot Wallet 1'),
('BUKaMtMvR5WH9v3aJL8BNz2PayVsrEhEiwDjcFHyLdng', 'KuCoin', 'KuCoin Hot Wallet 1'),
('u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w', 'Gate.io', 'Gate.io Hot Wallet 1'),
('AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATbo3s', 'Crypto.com', 'Crypto.com Hot Wallet 1'),
('88xTWZMeKFoCAyGJcvFfSMFhFRGWzEXoEoLELbT6u3fp', 'HTX (Huobi)', 'HTX Hot Wallet 1'),
('GeEHT4TPhf7McRiz9o6B3JZQjFi7bHcERyEU5fwFnJTk', 'Gemini', 'Gemini Hot Wallet 1'),
('5Xx3vFiwkHW1T9x8NU8RrJBpZ4XEzjTTGxV8FdYSzjWn', 'Bitfinex', 'Bitfinex Hot Wallet 1');

CREATE TRIGGER update_known_cex_wallets_updated_at
BEFORE UPDATE ON public.known_cex_wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
