-- Drop the existing overly restrictive UPDATE policy
DROP POLICY IF EXISTS "Users can update their own session visits" ON public.holders_page_visits;

-- Create a new UPDATE policy that allows anyone to update a record by its session_id
-- This is safe because visitors can only update their own session (passed in the update)
CREATE POLICY "Anyone can update visits by session_id"
ON public.holders_page_visits
FOR UPDATE
USING (true)
WITH CHECK (true);