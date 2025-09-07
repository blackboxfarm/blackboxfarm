import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Hard-coded investigation for the specific wallets
    const childWallet = 'AovoyjWR6iwzPSZEMjUfKeDtXhS71kq74gkFNyMLomjU';
    const parentWallet = 'AbFwiFMeVaUyUDGfNJ1HhoBBbnFcjncq5twrk6HrqdxP';
    const tokenMint = 'GvkxeDmoghdjdrmMtc7EZQVobTgV7JiBLEkmPdVyBAGS';

    console.log('Running direct investigation with Helius RPC...');

    // Use public Helius endpoint for investigation
    const heliusUrl = `https://api.helius.xyz/v0`;
    const publicKey = 'e60bf1c7-ebde-4b82-a8a7-2e62c6ad97a3'; // Public key for basic access

    // Get transactions using public API
    const getAllTransactions = async (address: string): Promise<any[]> => {
      let allTransactions: any[] = [];
      let before = '';
      
      for (let page = 0; page < 10; page++) { // Limit to 10 pages for now
        const url = `${heliusUrl}/addresses/${address}/transactions?api-key=${publicKey}&limit=1000${before ? `&before=${before}` : ''}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error(`Failed to fetch transactions: ${response.status}`);
          break;
        }
        
        const transactions = await response.json();
        if (!transactions || transactions.length === 0) break;
        
        allTransactions = allTransactions.concat(transactions);
        
        if (transactions.length < 1000) break;
        before = transactions[transactions.length - 1].signature;
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return allTransactions;
    };

    console.log('Fetching transactions...');
    const allTransactions = await getAllTransactions(childWallet);
    console.log(`Found ${allTransactions.length} total transactions`);

    // Analyze token transfers
    let totalTokensSold = 0;
    let totalTokenTransfers = 0;
    let firstTokenReceived = null;
    const tokenOrigins = new Set();

    for (const tx of allTransactions) {
      if (!tx.tokenTransfers) continue;
      
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint !== tokenMint) continue;
        
        totalTokenTransfers++;
        
        const isReceive = transfer.toTokenAccount && 
          (transfer.toTokenAccount.includes(childWallet) || transfer.toUserAccount === childWallet);
        const isSend = transfer.fromTokenAccount && 
          (transfer.fromTokenAccount.includes(childWallet) || transfer.fromUserAccount === childWallet);
        
        if (!isReceive && !isSend) continue;
        
        const amount = transfer.tokenAmount || 0;
        
        if (isReceive) {
          if (transfer.fromUserAccount) {
            tokenOrigins.add(transfer.fromUserAccount);
          }
          if (!firstTokenReceived || tx.timestamp < firstTokenReceived.timestamp) {
            firstTokenReceived = {
              signature: tx.signature,
              timestamp: tx.timestamp,
              amount: amount,
              fromAddress: transfer.fromUserAccount || '',
              toAddress: transfer.toUserAccount || ''
            };
          }
        } else if (isSend) {
          totalTokensSold += amount;
        }
      }
    }

    const parentRelated = Array.from(tokenOrigins).includes(parentWallet);

    const result = {
      childWallet,
      parentWallet,
      tokenMint,
      totalTokensSold,
      totalTransactions: totalTokenTransfers,
      firstTokenReceived,
      tokenOrigins: Array.from(tokenOrigins),
      parentRelationship: parentRelated,
      investigationSummary: `
INVESTIGATION COMPLETE - BAGLESS TOKEN ANALYSIS

🔍 CHILD WALLET: ${childWallet}
🔍 PARENT WALLET: ${parentWallet}
🔍 TOKEN: ${tokenMint} (Bagless)

🚨 CRITICAL FINDINGS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 TOTAL BAGLESS TOKENS SOLD: ${totalTokensSold.toLocaleString()}
📊 TOTAL TOKEN TRANSACTIONS: ${totalTokenTransfers}
🔗 TOKEN SOURCES: ${tokenOrigins.size} different addresses
🔗 PARENT WALLET CONNECTION: ${parentRelated ? '⚠️ DIRECT TRANSFERS DETECTED' : '❌ No direct transfers found'}

${firstTokenReceived ? `
📅 FIRST TOKENS RECEIVED:
   Date: ${new Date(firstTokenReceived.timestamp * 1000).toLocaleString()}
   Amount: ${firstTokenReceived.amount.toLocaleString()}
   From: ${firstTokenReceived.fromAddress}
   TX: ${firstTokenReceived.signature}
` : ''}

🎯 TOKEN ORIGIN ADDRESSES:
${Array.from(tokenOrigins).map(addr => `   • ${addr}${addr === parentWallet ? ' ⚠️ [PARENT WALLET]' : ''}`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ANSWER: The child wallet has sold ${totalTokensSold.toLocaleString()} Bagless tokens total.
${parentRelated ? 'SUSPICIOUS: Tokens came directly from the parent wallet!' : 'Tokens came from multiple sources.'}
      `
    };

    console.log('\n🎯 INVESTIGATION COMPLETE!');
    console.log(`Total Bagless tokens sold: ${totalTokensSold.toLocaleString()}`);
    console.log(`From ${tokenOrigins.size} different sources`);
    console.log(`Parent wallet involved: ${parentRelated}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Investigation error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Investigation failed', 
        details: error.message,
        summary: 'Unable to complete Bagless token investigation. Please check Helius API access.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});