import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TokenTransfer {
  signature: string
  timestamp: number
  type: 'send' | 'receive'
  amount: number
  fromAddress: string
  toAddress: string
  slot: number
  blockTime: number
}

interface InvestigationResult {
  childWallet: string
  parentWallet: string
  tokenMint: string
  totalTokensSold: number
  totalTransactions: number
  firstTokenReceived: TokenTransfer | null
  allTransfers: TokenTransfer[]
  tokenOrigins: string[]
  investigationSummary: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { childWallet, parentWallet, tokenMint } = await req.json();
    
    if (!childWallet || !parentWallet || !tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: childWallet, parentWallet, tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Helius API key from environment
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) {
      return new Response(
        JSON.stringify({ error: 'Helius API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const heliusUrl = `https://api.helius.xyz/v0`;

    console.log(`Starting investigation for child wallet: ${childWallet}`);
    console.log(`Token mint: ${tokenMint}`);

    // Get all transactions for the child wallet
    const getAllTransactions = async (address: string): Promise<any[]> => {
      let allTransactions: any[] = [];
      let before = '';
      
      while (true) {
        const url = `${heliusUrl}/addresses/${address}/transactions?api-key=${heliusApiKey}&limit=1000${before ? `&before=${before}` : ''}`;
        
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
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      return allTransactions;
    };

    console.log('Fetching all transactions for child wallet...');
    const allTransactions = await getAllTransactions(childWallet);
    console.log(`Found ${allTransactions.length} total transactions`);

    // Filter transactions involving the Bagless token
    const tokenTransfers: TokenTransfer[] = [];
    let totalTokensSold = 0;
    let firstTokenReceived: TokenTransfer | null = null;
    const tokenOrigins = new Set<string>();

    for (const tx of allTransactions) {
      if (!tx.tokenTransfers) continue;
      
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint !== tokenMint) continue;
        
        const isReceive = transfer.toTokenAccount && 
          (transfer.toTokenAccount.includes(childWallet) || transfer.toUserAccount === childWallet);
        const isSend = transfer.fromTokenAccount && 
          (transfer.fromTokenAccount.includes(childWallet) || transfer.fromUserAccount === childWallet);
        
        if (!isReceive && !isSend) continue;
        
        const amount = transfer.tokenAmount || 0;
        const transferData: TokenTransfer = {
          signature: tx.signature,
          timestamp: tx.timestamp,
          type: isReceive ? 'receive' : 'send',
          amount: amount,
          fromAddress: transfer.fromUserAccount || '',
          toAddress: transfer.toUserAccount || '',
          slot: tx.slot,
          blockTime: tx.timestamp
        };
        
        tokenTransfers.push(transferData);
        
        if (isReceive) {
          if (transfer.fromUserAccount) {
            tokenOrigins.add(transfer.fromUserAccount);
          }
          if (!firstTokenReceived || tx.timestamp < firstTokenReceived.timestamp) {
            firstTokenReceived = transferData;
          }
        } else if (isSend) {
          totalTokensSold += amount;
        }
      }
    }

    // Sort transfers by timestamp (oldest first)
    tokenTransfers.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`Found ${tokenTransfers.length} Bagless token transfers`);
    console.log(`Total tokens sold: ${totalTokensSold}`);
    console.log(`Token received from ${tokenOrigins.size} different sources`);

    // Check relationship with parent wallet
    const parentRelated = tokenTransfers.some(transfer => 
      transfer.fromAddress === parentWallet || transfer.toAddress === parentWallet
    );

    // Generate investigation summary
    let summary = `INVESTIGATION RESULTS:\n\n`;
    summary += `Child Wallet: ${childWallet}\n`;
    summary += `Parent Wallet: ${parentWallet}\n`;
    summary += `Token: ${tokenMint} (Bagless)\n\n`;
    summary += `FINDINGS:\n`;
    summary += `- Total Bagless tokens SOLD by child wallet: ${totalTokensSold.toLocaleString()}\n`;
    summary += `- Total Bagless-related transactions: ${tokenTransfers.length}\n`;
    summary += `- Tokens received from ${tokenOrigins.size} different sources\n`;
    summary += `- Parent wallet relationship: ${parentRelated ? 'DIRECT TRANSFERS DETECTED' : 'No direct transfers found'}\n\n`;
    
    if (firstTokenReceived) {
      const firstDate = new Date(firstTokenReceived.timestamp * 1000);
      summary += `FIRST BAGLESS TOKENS RECEIVED:\n`;
      summary += `- Date: ${firstDate.toISOString()}\n`;
      summary += `- Amount: ${firstTokenReceived.amount.toLocaleString()}\n`;
      summary += `- From: ${firstTokenReceived.fromAddress}\n`;
      summary += `- Transaction: ${firstTokenReceived.signature}\n\n`;
    }
    
    summary += `TOKEN SOURCES:\n`;
    Array.from(tokenOrigins).forEach(origin => {
      summary += `- ${origin}\n`;
    });

    const result: InvestigationResult = {
      childWallet,
      parentWallet,
      tokenMint,
      totalTokensSold,
      totalTransactions: tokenTransfers.length,
      firstTokenReceived,
      allTransfers: tokenTransfers,
      tokenOrigins: Array.from(tokenOrigins),
      investigationSummary: summary
    };

    console.log('Investigation completed successfully');
    console.log(summary);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Investigation error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Investigation failed', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});