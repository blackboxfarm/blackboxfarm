-- Create a function to safely retrieve trading positions with decrypted secrets
-- This ensures we can access decrypted owner_secret for trading operations
CREATE OR REPLACE FUNCTION get_active_positions_with_secrets(session_id_param uuid)
RETURNS TABLE (
    id uuid,
    session_id uuid,
    lot_id text,
    entry_price numeric,
    high_price numeric,
    quantity_raw bigint,
    quantity_ui numeric,
    entry_timestamp timestamptz,
    owner_pubkey text,
    owner_secret text,
    status text,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tp.id,
        tp.session_id,
        tp.lot_id,
        tp.entry_price,
        tp.high_price,
        tp.quantity_raw,
        tp.quantity_ui,
        tp.entry_timestamp,
        tp.owner_pubkey,
        decrypt_owner_secret(tp.owner_secret) as owner_secret,
        tp.status,
        tp.created_at,
        tp.updated_at
    FROM trading_positions tp
    WHERE tp.session_id = session_id_param 
    AND tp.status = 'active';
END;
$$;