INSERT INTO user_roles (user_id, role, is_active)
VALUES (
  '080904e4-0e95-4ddc-adb2-d2c161fdb068',
  'super_admin',
  true
)
ON CONFLICT (user_id, role) DO UPDATE SET is_active = true;