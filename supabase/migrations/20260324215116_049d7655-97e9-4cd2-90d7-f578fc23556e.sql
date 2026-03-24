UPDATE holders_intel_post_queue 
SET scheduled_at = NOW()
WHERE status = 'pending' 
AND id IN (
  '464ae6ff-254d-4542-b252-e68eb6696cd2',
  '74ad6240-3ecc-475b-b5b2-a73b724af98d',
  '7b1df57f-4501-4352-a57f-003dabef9fb9',
  '7dde4fc2-7a3d-4936-b413-d7bbf5ec5cb3',
  '1663ccd4-43a4-40d6-b766-dde20f7d8dbf',
  'f471ce2e-bcd5-4801-b770-60d296ee2aed',
  'c1021238-ff0f-4686-bbeb-816e78d6966c',
  '6c3799b3-3305-4e27-8039-d772923aa4d3'
)