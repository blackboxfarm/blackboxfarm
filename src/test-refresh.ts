import { supabase } from '@/integrations/supabase/client';

export async function testRefreshBalances() {
  console.log('🔄 Manually triggering wallet balance refresh...');
  
  const { data, error } = await supabase.functions.invoke('refresh-wallet-balances');
  
  if (error) {
    console.error('❌ Error refreshing balances:', error);
    return { success: false, error };
  }
  
  console.log('✅ Refresh completed:', data);
  return { success: true, data };
}

// Auto-run the refresh
testRefreshBalances();