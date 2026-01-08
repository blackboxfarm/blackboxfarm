
-- Update channel name in fantasy positions (Trophy Case, Toilet Case, Open Positions)
UPDATE telegram_fantasy_positions 
SET channel_name = 'INSIDER WALLET TRACKING'
WHERE channel_name = '$WHALE JAN 8';

-- Update channel name in channel calls history
UPDATE telegram_channel_calls 
SET channel_name = 'INSIDER WALLET TRACKING'
WHERE channel_name = '$WHALE JAN 8';
