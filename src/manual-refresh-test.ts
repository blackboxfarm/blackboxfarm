import { supabase } from '@/integrations/supabase/client';

// Manual test to refresh wallet balances
console.log('🔄 Starting manual wallet balance refresh test...');

supabase.functions.invoke('refresh-wallet-balances').then(({ data, error }) => {
  if (error) {
    console.error('❌ Error refreshing balances:', error);
  } else {
    console.log('✅ Refresh completed:', data);
  }
});