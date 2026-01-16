-- Deactivate the expired duplicate "Get $FUCT" banner instead of deleting (linked to paid order)
UPDATE banner_ads SET is_active = false WHERE id = '19974e61-7338-45b1-96b0-fd05ff5c43ab';

-- Update Ledger from position 3 to position 4
UPDATE banner_ads SET position = 4 WHERE id = 'a0e3f0a8-259d-4372-9f68-39d471cb756f';

-- Insert new Padre.gg referral banner at position 3
INSERT INTO banner_ads (title, image_url, link_url, position, is_active, weight, notes)
VALUES (
  'Padre.gg Trading',
  '/banners/padre-meme-coins.png',
  'https://trade.padre.gg/rk/blackbox',
  3,
  true,
  5,
  'Internal referral tracking for Padre.gg partnership'
);