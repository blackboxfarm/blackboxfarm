-- Manual correction from Solscan on-chain data for BABYCHIBI buy
-- Tx: eAfVucXnp7ZbqFaJTrbHLuL78z8EbNfAy51EkDH69hiXNzrrXiMDABNe7AsDUSSeGn1qnTVMQ9LNaQri3QvRfYs
-- On-chain: 0.497435962 SOL → 5,068,028.199295 BABYCHIBI tokens
UPDATE public.flip_positions
SET 
  quantity_tokens = '5068028.199295',
  buy_amount_sol = 0.497435962,
  buy_amount_usd = 44.1,
  buy_price_usd = 44.1 / 5068028.199295,
  entry_verified = true,
  error_message = null
WHERE id = 'a27b6fcc-822f-47c1-a338-96e2d273ecf8';