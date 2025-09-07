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
    let totalTokensBought = 0;
    let totalTokensSold = 0;
    let totalTokenTransfers = 0;
    let firstTokenReceived = null;
    const tokenOrigins = new Set();
    const allTransfers: any[] = [];

    console.log(`Analyzing transactions for token ${tokenMint}...`);

    for (const tx of allTransactions) {
      if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) continue;
      
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint !== tokenMint) continue;
        
        console.log(`Found token transfer:`, {
          signature: tx.signature,
          from: transfer.fromUserAccount,
          to: transfer.toUserAccount,
          amount: transfer.tokenAmount
        });
        
        totalTokenTransfers++;
        
        // Check if child wallet is receiving tokens
        const isReceiving = transfer.toUserAccount === childWallet;
        // Check if child wallet is sending tokens  
        const isSending = transfer.fromUserAccount === childWallet;
        
        if (!isReceiving && !isSending) continue;
        
        const amount = transfer.tokenAmount || 0;
        
        // Add to allTransfers array
        allTransfers.push({
          signature: tx.signature,
          timestamp: tx.timestamp,
          type: isReceiving ? 'receive' : 'send',
          amount: amount,
          fromAddress: transfer.fromUserAccount || '',
          toAddress: transfer.toUserAccount || '',
          slot: tx.slot || 0,
          blockTime: tx.timestamp
        });
        
        if (isReceiving) {
          totalTokensBought += amount;
          if (transfer.fromUserAccount) {
            tokenOrigins.add(transfer.fromUserAccount);
          }
          if (!firstTokenReceived || tx.timestamp < firstTokenReceived.timestamp) {
            firstTokenReceived = {
              signature: tx.signature,
              timestamp: tx.timestamp,
              amount: amount,
              fromAddress: transfer.fromUserAccount || '',
              toAddress: transfer.toUserAccount || '',
              type: 'receive',
              slot: tx.slot || 0,
              blockTime: tx.timestamp
            };
          }
        } else if (isSending) {
          totalTokensSold += amount;
        }
      }
    }

    console.log(`Analysis complete:`, {
      totalTokensBought,
      totalTokensSold,
      totalTokenTransfers,
      tokenOrigins: Array.from(tokenOrigins)
    });

    const parentRelated = Array.from(tokenOrigins).includes(parentWallet);

    const result = {
      childWallet,
      parentWallet,
      tokenMint,
      totalTokensBought,
      totalTokensSold,
      totalTransactions: totalTokenTransfers,
      firstTokenReceived,
      allTransfers: allTransfers.sort((a, b) => b.timestamp - a.timestamp),
      tokenOrigins: Array.from(tokenOrigins),
      parentRelationship: parentRelated,
      investigationSummary: `
INVESTIGATION COMPLETE - BAGLESS TOKEN ANALYSIS

🔍 CHILD WALLET: ${childWallet}
🔍 PARENT WALLET: ${parentWallet}
🔍 TOKEN: ${tokenMint} (Bagless)

🚨 CRITICAL FINDINGS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 TOTAL BAGLESS TOKENS BOUGHT: ${totalTokensBought.toLocaleString()}
💸 TOTAL BAGLESS TOKENS SOLD: ${totalTokensSold.toLocaleString()}
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

ANSWER: The child wallet has bought ${totalTokensBought.toLocaleString()} Bagless tokens and sold ${totalTokensSold.toLocaleString()} tokens.
${parentRelated ? 'SUSPICIOUS: Tokens came directly from the parent wallet!' : 'Tokens came from multiple sources.'}
      `
    };

    console.log('\n🎯 INVESTIGATION COMPLETE!');
    console.log(`Total Bagless tokens bought: ${totalTokensBought.toLocaleString()}`);
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