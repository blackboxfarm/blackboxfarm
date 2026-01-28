
# Plan: Fix Rate Limiting for Account Management Dashboard

## Problem Summary

The **Accounts tab** in the SuperAdmin dashboard shows zero records because:

1. The `profiles` table RLS policy calls `validate_profile_access()` for SELECT operations
2. This function restricts users to viewing **only their own profile** (super admins have no override)
3. The function also calls `check_rate_limit()` which attempts an INSERT operation
4. In the Lovable Preview's read-only mode, this INSERT fails, causing the entire query to fail

## Solution Overview

We need to make two key changes:

1. **Update the `validate_profile_access` function** to allow super admins to view all profiles
2. **Make rate limiting graceful** - if the INSERT fails (read-only mode), don't block the query

---

## Technical Implementation

### Step 1: Update `validate_profile_access` Function

Create a new database migration that:
- Allows super admins to bypass the "own profile only" restriction
- Wraps the rate limiting INSERT in an exception handler so failures don't block reads

```sql
CREATE OR REPLACE FUNCTION public.validate_profile_access(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    current_user_id uuid;
    rate_limit_result jsonb;
    is_admin boolean := false;
BEGIN
    -- Get current user
    current_user_id := auth.uid();
    
    -- Block if no authenticated user
    IF current_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- Check if user is super admin (they can access all profiles)
    SELECT public.is_super_admin(current_user_id) INTO is_admin;
    
    IF is_admin THEN
        RETURN true;  -- Super admins can access all profiles
    END IF;
    
    -- Regular users can only access their own profile
    IF current_user_id != target_user_id THEN
        RETURN false;
    END IF;
    
    -- Check rate limiting (with graceful failure handling)
    BEGIN
        SELECT public.check_rate_limit(
            current_user_id::text,
            'profile_access',
            20,
            1   
        ) INTO rate_limit_result;
        
        IF (rate_limit_result ->> 'is_blocked')::boolean THEN
            RETURN false;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- If rate limit check fails (e.g., read-only mode), allow access
        -- This ensures reads work even when writes are blocked
        NULL;
    END;
    
    RETURN true;
END;
$function$;
```

### Step 2: Update `check_rate_limit` Function (Alternative Approach)

Optionally, we can also make `check_rate_limit` itself more resilient by handling the read-only case gracefully:

```sql
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  check_identifier text,
  check_action_type text,
  max_attempts integer DEFAULT 5,
  window_minutes integer DEFAULT 15
)
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_record public.rate_limits;
  is_blocked boolean := false;
  attempts_remaining integer;
  reset_time timestamp with time zone;
BEGIN
  BEGIN
    -- Get or create rate limit record
    SELECT * INTO current_record
    FROM public.rate_limits
    WHERE identifier = check_identifier 
      AND action_type = check_action_type;
    
    IF current_record IS NULL THEN
      -- Create new record
      INSERT INTO public.rate_limits (identifier, action_type)
      VALUES (check_identifier, check_action_type)
      RETURNING * INTO current_record;
    ELSE
      -- Check if we should reset the counter
      IF current_record.first_attempt < (now() - (window_minutes || ' minutes')::interval) THEN
        UPDATE public.rate_limits
        SET attempt_count = 1,
            first_attempt = now(),
            last_attempt = now(),
            is_blocked = false,
            blocked_until = NULL
        WHERE id = current_record.id
        RETURNING * INTO current_record;
      ELSE
        UPDATE public.rate_limits
        SET attempt_count = attempt_count + 1,
            last_attempt = now(),
            is_blocked = (attempt_count + 1) >= max_attempts,
            blocked_until = CASE 
              WHEN (attempt_count + 1) >= max_attempts 
              THEN (now() + (window_minutes || ' minutes')::interval)
              ELSE NULL
            END
        WHERE id = current_record.id
        RETURNING * INTO current_record;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- In read-only mode or other failures, return unblocked status
    RETURN jsonb_build_object(
      'is_blocked', false,
      'attempts_used', 0,
      'attempts_remaining', max_attempts,
      'reset_time', now() + (window_minutes || ' minutes')::interval,
      'window_minutes', window_minutes,
      'error', 'Rate limit check skipped: ' || SQLERRM
    );
  END;
  
  -- Calculate response data
  attempts_remaining := GREATEST(0, max_attempts - COALESCE(current_record.attempt_count, 0));
  reset_time := COALESCE(
    current_record.blocked_until, 
    current_record.first_attempt + (window_minutes || ' minutes')::interval,
    now() + (window_minutes || ' minutes')::interval
  );
  
  RETURN jsonb_build_object(
    'is_blocked', COALESCE(current_record.is_blocked, false),
    'attempts_used', COALESCE(current_record.attempt_count, 0),
    'attempts_remaining', attempts_remaining,
    'reset_time', reset_time,
    'window_minutes', window_minutes
  );
END;
$$;
```

---

## Changes Summary

| Component | Change | Purpose |
|-----------|--------|---------|
| `validate_profile_access()` | Add super admin check | Allow admins to view all profiles |
| `validate_profile_access()` | Wrap rate limit in exception handler | Prevent read failures in read-only mode |
| `check_rate_limit()` | Add exception handler for INSERT/UPDATE | Gracefully handle read-only database mode |

## Files to Modify

1. **New migration file**: `supabase/migrations/XXXXXXXX_fix_profile_access_rate_limit.sql`
   - Updated `validate_profile_access` function
   - Updated `check_rate_limit` function

## Testing Steps

After deployment:
1. Navigate to `/super-admin` → Holders Intel → Accounts tab
2. Verify all 13 user accounts are displayed
3. Verify the dashboard shows correct stats (total accounts, advertisers, admins, verified, 2FA)
4. Test in both preview and production environments

## Security Considerations

- Super admin access is validated using the existing `is_super_admin()` function which checks the `user_roles` table
- Regular users still cannot see other users' profiles
- Rate limiting still applies to regular users (just fails gracefully in read-only mode)
- No sensitive data exposure - the edge function `get-all-users` already handles auth.users data securely
