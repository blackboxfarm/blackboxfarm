import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TokenMintData {
  mint: string;
  symbol?: string;
  name?: string;
  description?: string;
  image?: string;
  // Trading data
  holderCount?: number;
  buyCount?: number;
  sellCount?: number;
  currentPriceUsd?: number;
  currentPriceSol?: number;
  bondingCurvePercent?: number;
  marketCapUsd?: number;
  liquidityUsd?: number;
  volume24h?: number;
  // Graduation status
  isGraduated?: boolean;
  launchpad?: 'pump.fun' | 'bags.fm' | 'bonk.fun' | 'raydium';
  creatorWallet?: string;
}

interface NotificationRequest {
  type: 'email' | 'push';
  to: string;
  subject: string;
  message: string;
  notificationType: 'campaign' | 'transaction' | 'wallet' | 'security' | 'system';
  level: 'info' | 'success' | 'warning' | 'error';
  data?: {
    mints?: TokenMintData[];
    isTest?: boolean;
    [key: string]: any;
  };
}

function formatNumber(num: number | undefined): string {
  if (num === undefined || num === null) return 'N/A';
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || price === null) return 'N/A';
  if (price < 0.00001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(4)}`;
}

function generateTokenCardHtml(token: TokenMintData): string {
  const solscanUrl = `https://solscan.io/token/${token.mint}`;
  const dexScreenerUrl = `https://dexscreener.com/solana/${token.mint}`;
  
  // Detect if token is graduated (has Raydium liquidity or bondingCurve >= 100)
  const isGraduated = token.isGraduated || (token.bondingCurvePercent !== undefined && token.bondingCurvePercent >= 100);
  
  // Determine launchpad
  const launchpad = token.launchpad || 'pump.fun';
  const launchpadUrl = launchpad === 'bags.fm' ? `https://bags.fm/token/${token.mint}` :
                       launchpad === 'bonk.fun' ? `https://bonk.fun/token/${token.mint}` :
                       `https://pump.fun/${token.mint}`;
  const launchpadLabel = launchpad === 'bags.fm' ? '💼 bags.fm' :
                         launchpad === 'bonk.fun' ? '🐕 bonk.fun' :
                         '🎯 pump.fun';
  
  const bondingCurveColor = isGraduated ? '#22c55e' :
                            (token.bondingCurvePercent ?? 0) >= 80 ? '#22c55e' : 
                            (token.bondingCurvePercent ?? 0) >= 50 ? '#f59e0b' : '#ef4444';
  
  // Status badge
  const statusBadge = isGraduated ? 
    `<span style="background: linear-gradient(135deg, #22c55e, #16a34a); color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">✅ GRADUATED TO RAYDIUM</span>` :
    `<span style="background: ${bondingCurveColor}20; color: ${bondingCurveColor}; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">📈 ${(token.bondingCurvePercent ?? 0).toFixed(1)}% Bonding Curve</span>`;
  
  return `
    <div style="background: #1a1a2e; border-radius: 12px; padding: 20px; margin-bottom: 16px; border: 1px solid #2a2a4e;">
      <!-- Token Header -->
      <div style="display: flex; align-items: center; margin-bottom: 12px;">
        ${token.image ? `<img src="${token.image}" alt="${token.symbol}" style="width: 48px; height: 48px; border-radius: 50%; margin-right: 12px; object-fit: cover;" onerror="this.style.display='none'" />` : ''}
        <div style="flex: 1;">
          <h3 style="margin: 0; color: #f59e0b; font-size: 20px; font-weight: bold;">
            ${token.symbol ? `$${token.symbol}` : 'Unknown Token'}
          </h3>
          <p style="margin: 4px 0 0 0; color: #a0a0b0; font-size: 14px;">
            ${token.name || 'No name'}
          </p>
        </div>
        ${statusBadge}
      </div>
      
      ${token.description ? `
        <p style="color: #b0b0c0; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0; padding: 12px; background: #0d0d1a; border-radius: 8px;">
          ${token.description.slice(0, 200)}${token.description.length > 200 ? '...' : ''}
        </p>
      ` : ''}
      
      <!-- Trading Stats Grid -->
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
        ${token.currentPriceUsd !== undefined ? `
          <div style="background: #0d0d1a; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="color: #22c55e; font-size: 18px; font-weight: bold;">${formatPrice(token.currentPriceUsd)}</div>
            <div style="color: #666; font-size: 11px;">Current Price</div>
          </div>
        ` : ''}
        
        ${token.marketCapUsd !== undefined ? `
          <div style="background: #0d0d1a; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="color: #a855f7; font-size: 18px; font-weight: bold;">${formatNumber(token.marketCapUsd)}</div>
            <div style="color: #666; font-size: 11px;">Market Cap</div>
          </div>
        ` : ''}
        
        ${token.liquidityUsd !== undefined ? `
          <div style="background: #0d0d1a; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="color: #3b82f6; font-size: 18px; font-weight: bold;">${formatNumber(token.liquidityUsd)}</div>
            <div style="color: #666; font-size: 11px;">Liquidity</div>
          </div>
        ` : ''}
        
        ${token.holderCount !== undefined ? `
          <div style="background: #0d0d1a; padding: 12px; border-radius: 8px; text-align: center;">
            <div style="color: #f59e0b; font-size: 18px; font-weight: bold;">${formatNumber(token.holderCount)}</div>
            <div style="color: #666; font-size: 11px;">Holders</div>
          </div>
        ` : ''}
      </div>
      
      <!-- Buy/Sell Stats -->
      ${(token.buyCount !== undefined || token.sellCount !== undefined) ? `
        <div style="display: flex; justify-content: center; gap: 24px; margin-bottom: 16px; padding: 12px; background: #0d0d1a; border-radius: 8px;">
          <div style="text-align: center;">
            <span style="color: #22c55e; font-size: 16px; font-weight: bold;">↑ ${token.buyCount ?? 0}</span>
            <span style="color: #666; font-size: 12px; margin-left: 4px;">Buys</span>
          </div>
          <div style="text-align: center;">
            <span style="color: #ef4444; font-size: 16px; font-weight: bold;">↓ ${token.sellCount ?? 0}</span>
            <span style="color: #666; font-size: 12px; margin-left: 4px;">Sells</span>
          </div>
          ${token.volume24h !== undefined ? `
            <div style="text-align: center;">
              <span style="color: #f59e0b; font-size: 16px; font-weight: bold;">${formatNumber(token.volume24h)}</span>
              <span style="color: #666; font-size: 12px; margin-left: 4px;">24h Vol</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
      
      <!-- Contract Address -->
      <div style="background: #0d0d1a; padding: 10px; border-radius: 8px; margin-bottom: 16px;">
        <div style="color: #666; font-size: 11px; margin-bottom: 4px;">Contract Address</div>
        <code style="color: #f59e0b; font-size: 12px; word-break: break-all;">${token.mint}</code>
      </div>
      
      <!-- Action Links -->
      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <a href="${launchpadUrl}" target="_blank" style="display: inline-block; background: #22c55e; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
          ${launchpadLabel}
        </a>
        ${isGraduated ? `
          <a href="https://raydium.io/swap/?inputMint=sol&outputMint=${token.mint}" target="_blank" style="display: inline-block; background: #6366f1; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
            🌊 Raydium
          </a>
        ` : ''}
        <a href="${solscanUrl}" target="_blank" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
          🔍 Solscan
        </a>
        <a href="${dexScreenerUrl}" target="_blank" style="display: inline-block; background: #a855f7; color: white; padding: 10px 16px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 600;">
          📊 DexScreener
        </a>
      </div>
    </div>
  `;
}

function generateEmailHtml(subject: string, message: string, data?: NotificationRequest['data']): string {
  const mints = data?.mints || [];
  const tokenCards = mints.map(generateTokenCardHtml).join('');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background: #0d0d1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
          <img src="https://blackbox.farm/lovable-uploads/8c88fead-d160-47f3-ac65-3493afcf9280.png" alt="BlackBox Logo" style="width: 56px; height: 56px; margin-bottom: 12px; object-fit: contain;" />
          <h1 style="color: #0d0d1a; margin: 0; font-size: 24px; font-weight: bold;">🚨 New Token Alert</h1>
          <p style="color: rgba(0,0,0,0.7); margin: 8px 0 0 0; font-size: 14px;">BlackBox Farm Mint Monitor</p>
        </div>
        
        <!-- Main Content -->
        <div style="background: #16162a; padding: 24px; border-radius: 0 0 12px 12px;">
          <p style="color: #b0b0c0; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
            ${message.replace(/\n/g, '<br>')}
          </p>
          
          ${tokenCards}
          
          <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #2a2a4e; text-align: center;">
            <a href="https://blackbox.farm/token-analysis" target="_blank" style="display: inline-block; background: #f59e0b; color: #0d0d1a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
              Open Watchdog Dashboard →
            </a>
          </div>
          
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #2a2a4e; font-size: 12px; color: #666; text-align: center;">
            <p style="margin: 0;">This is an automated notification from BlackBox Farm.</p>
            <p style="margin: 8px 0 0 0;">Manage your notification settings in your dashboard.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    const { type, to, subject, message, notificationType, level, data }: NotificationRequest = await req.json();

    console.log(`Sending ${type} notification:`, { to, subject, notificationType, level, tokenCount: data?.mints?.length });

    if (type === 'email') {
      const emailHtml = generateEmailHtml(subject, message, data);
      
      const emailResponse = await resend.emails.send({
        from: "BlackBox Farm <noreply@blackbox.farm>",
        to: [to],
        subject: subject,
        html: emailHtml,
      });

      console.log("Email sent successfully:", emailResponse);

      return new Response(JSON.stringify({ success: true, emailResponse }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: "Push notification would be sent here" 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });

  } catch (error: any) {
    console.error("Error in send-notification function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
