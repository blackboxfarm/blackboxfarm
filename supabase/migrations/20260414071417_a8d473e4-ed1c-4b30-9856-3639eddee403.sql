
-- Step 1: Delete 2 duplicate articles
DELETE FROM intel_briefings WHERE id = 'f5a2b3c4-d6e7-4f89-a0b1-c2d3e4f5a6b7';
DELETE FROM intel_briefings WHERE id = 'f4a3b2c1-d5e6-4f78-9a0b-c1d2e3f4a5b6';

-- Step 2: Backdate articles 1-22 (published) and schedule 23-34 (unpublished)
-- Phase 1: Problem Awareness
UPDATE intel_briefings SET published_at = '2025-11-05 10:00:00+00', is_published = true WHERE id = '18c8abdd-7f09-4d8a-a3d7-5e7c6a8c9bf6';
UPDATE intel_briefings SET published_at = '2025-11-12 10:00:00+00', is_published = true WHERE id = '16f77360-35f8-4c83-aded-0ecc5e17e5e1';
UPDATE intel_briefings SET published_at = '2025-11-19 10:00:00+00', is_published = true WHERE id = 'c8ffc5e1-61f2-470b-8ebc-7bce4e8f9f35';
UPDATE intel_briefings SET published_at = '2025-11-26 10:00:00+00', is_published = true WHERE id = '54c2c5aa-f32a-456e-8b8f-d37ed4bc91e9';
UPDATE intel_briefings SET published_at = '2025-12-03 10:00:00+00', is_published = true WHERE id = 'fb6a71c8-f1f0-42b0-99ad-654d1b490610';
UPDATE intel_briefings SET published_at = '2025-12-10 10:00:00+00', is_published = true WHERE id = 'ab852680-76fa-4428-91e4-f12251aa4cb5';

-- Phase 2: Solution Framework
UPDATE intel_briefings SET published_at = '2025-12-17 10:00:00+00', is_published = true WHERE id = 'd20b7b2e-2c0f-4f5a-bfcf-dd0e7e44a79b';
UPDATE intel_briefings SET published_at = '2025-12-24 10:00:00+00', is_published = true WHERE id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
UPDATE intel_briefings SET published_at = '2026-01-07 10:00:00+00', is_published = true WHERE id = '7ce72fb1-9c21-4740-8968-df1c1ed58884';
UPDATE intel_briefings SET published_at = '2026-01-14 10:00:00+00', is_published = true WHERE id = '7e1e18c2-55c5-47c8-a3c2-ab5e09a6b41e';
UPDATE intel_briefings SET published_at = '2026-01-21 10:00:00+00', is_published = true WHERE id = 'b2c9fab4-6b87-45a7-99f6-27cb35f61959';
UPDATE intel_briefings SET published_at = '2026-01-28 10:00:00+00', is_published = true WHERE id = 'ed139f0e-0ef5-4b7e-8067-a7b5cc170fa2';

-- Phase 3: Tool Introduction
UPDATE intel_briefings SET published_at = '2026-02-04 10:00:00+00', is_published = true WHERE id = '3e9d6a47-5f23-49cd-a7e4-3d2a5e46f3c7';
UPDATE intel_briefings SET published_at = '2026-02-11 10:00:00+00', is_published = true WHERE id = 'c288871c-5ec2-466a-9c4c-c03677f25d9e';
UPDATE intel_briefings SET published_at = '2026-02-18 10:00:00+00', is_published = true WHERE id = 'bf204208-f362-48fe-b2ca-da9b2863c0ae';
UPDATE intel_briefings SET published_at = '2026-02-25 10:00:00+00', is_published = true WHERE id = 'e3f1d00c-cb22-469b-9cd8-0e2c36e40bf3';
UPDATE intel_briefings SET published_at = '2026-03-04 10:00:00+00', is_published = true WHERE id = 'ee86ac25-0e84-4173-935a-235d67c0f3f8';
UPDATE intel_briefings SET published_at = '2026-03-11 10:00:00+00', is_published = true WHERE id = 'efa2d619-3a0b-4cd9-8285-e6c69f87ee5a';

-- Phase 4: Deep Intelligence
UPDATE intel_briefings SET published_at = '2026-03-18 10:00:00+00', is_published = true WHERE id = '802ceff4-45a0-447c-b8e0-9a0be09239ee';
UPDATE intel_briefings SET published_at = '2026-03-25 10:00:00+00', is_published = true WHERE id = 'ed573232-7b82-432b-8728-6f6ebdf33964';
UPDATE intel_briefings SET published_at = '2026-04-01 10:00:00+00', is_published = true WHERE id = '4f603e56-a26d-4aa4-8c56-23ff45358e39';
UPDATE intel_briefings SET published_at = '2026-04-08 10:00:00+00', is_published = true WHERE id = '9b2e3870-dfe2-4d3d-8b5f-67c821b3f0f5';

-- Phase 5: Future Posts (unpublished)
UPDATE intel_briefings SET published_at = '2026-04-15 10:00:00+00', is_published = false WHERE id = '1ee1846c-f4c9-473c-a520-654a22a65aee';
UPDATE intel_briefings SET published_at = '2026-04-22 10:00:00+00', is_published = false WHERE id = 'c191bb56-cb16-40e2-b2b3-dc8d7bed3e59';
UPDATE intel_briefings SET published_at = '2026-04-29 10:00:00+00', is_published = false WHERE id = '4f1a223c-933a-4830-80d6-f405e7d4098a';
UPDATE intel_briefings SET published_at = '2026-05-06 10:00:00+00', is_published = false WHERE id = '6883511c-7d5d-480f-bbfe-2c1a6e414aa5';
UPDATE intel_briefings SET published_at = '2026-05-13 10:00:00+00', is_published = false WHERE id = 'dc4054d3-0d29-484d-a4d8-6002f5f8a7f4';
UPDATE intel_briefings SET published_at = '2026-05-20 10:00:00+00', is_published = false WHERE id = 'ecfebae5-70f0-417f-b2aa-84b34576859f';
UPDATE intel_briefings SET published_at = '2026-05-27 10:00:00+00', is_published = false WHERE id = '99a3dbb3-daa6-4b98-8e5c-65edba08c600';
UPDATE intel_briefings SET published_at = '2026-06-03 10:00:00+00', is_published = false WHERE id = '60b73363-3633-4468-98ba-75e2f9b69998';
UPDATE intel_briefings SET published_at = '2026-06-10 10:00:00+00', is_published = false WHERE id = 'fce912f8-b4cb-43d1-b97b-be22f36ea752';
UPDATE intel_briefings SET published_at = '2026-06-17 10:00:00+00', is_published = false WHERE id = '9d344732-4556-42eb-ae7b-1d6aeb1bd5c8';
UPDATE intel_briefings SET published_at = '2026-06-24 10:00:00+00', is_published = false WHERE id = 'fb61fbb5-442b-4a74-970e-0fb7afebb572';
UPDATE intel_briefings SET published_at = '2026-07-01 10:00:00+00', is_published = false WHERE id = '2223edb0-46ee-402f-b71d-78abd84aa6b8';
