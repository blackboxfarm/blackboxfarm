-- Reset incorrectly marked blue-verified regular members
-- Only Admins and Moderators should be auto-marked blue via staff inheritance
UPDATE community_follow_targets 
SET is_blue_verified = false 
WHERE community_role IN ('member', 'Member') 
  AND is_blue_verified = true;