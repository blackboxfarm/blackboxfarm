-- Clean up legacy jupiter_v6 data from the logs
DELETE FROM sol_price_fetch_logs WHERE source_name = 'jupiter_v6';