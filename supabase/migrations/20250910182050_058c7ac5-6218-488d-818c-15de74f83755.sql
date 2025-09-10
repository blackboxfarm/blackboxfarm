-- Check what triggers are on blackbox_campaigns table
SELECT 
    t.trigger_name,
    t.event_manipulation,
    t.action_statement,
    t.action_timing,
    t.action_orientation
FROM information_schema.triggers t
WHERE t.event_object_table = 'blackbox_campaigns'
AND t.event_object_schema = 'public';