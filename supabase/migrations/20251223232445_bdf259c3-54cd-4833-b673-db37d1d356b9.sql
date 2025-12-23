-- Enable real-time updates for flip_positions table
ALTER TABLE flip_positions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE flip_positions;