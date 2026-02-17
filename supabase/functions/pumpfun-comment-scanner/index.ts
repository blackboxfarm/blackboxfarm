import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts'
import { encodeHex } from 'https://deno.land/std@0.224.0/encoding/hex.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * PUMPFUN COMMENT SCANNER
 * 
 * Uses Firecrawl to scrape pump.fun comment sections and detect:
 * 1. Bot accounts with random/gibberish usernames
 * 2. Copy-paste/duplicate messages across tokens
 * 3. Ambiguous hype phrases ("iykyk", "setup is there", etc.)
 * 4. Accounts that appear on multiple tokens (especially from same dev)
 * 
 * Can be called:
 * - For a specific token mint
 * - As batch scan for recent watchlist tokens
 */

// Known bot/hype phrases that indicate shill bots
const SHILL_PHRASES = [
  'iykyk', 'if you know you know', 'lfg', 'lets go', 'to the moon',
  'setup is there', 'buyers follow', 'push is there', 'got the juice',
  'degen playground', 'yolo style', 'gn frens', 'microcap vibes',
  'early af', 'dont sleep', 'nfa', 'just setup', 'no luck here just setup',
  'send it', 'gem alert', 'next 100x', 'easy money', 'free money',
  'aped in', 'ape in', 'diamond hands', 'wagmi', 'ngmi if you sleep',
  'bullish af', 'moon soon', 'trust the process', 'accumulate',
  'stealth launch', 'based dev', 'safu', 'community driven',
]

// Calculate Shannon entropy for username (higher = more random/bot-like)
function calculateEntropy(str: string): number {
  const len = str.length
  if (len === 0) return 0
  const freq: Record<string, number> = {}
  for (const ch of str) {
    freq[ch] = (freq[ch] || 0) + 1
  }
  let entropy = 0
  for (const ch in freq) {
    const p = freq[ch] / len
    entropy -= p * Math.log2(p)
  }
  return entropy
}

// Check if username looks bot-generated
function isRandomUsername(username: string): { isRandom: boolean; entropy: number; reasons: string[] } {
  const reasons: string[] = []
  const entropy = calculateEntropy(username.toLowerCase())
  
  // High entropy = random characters
  if (entropy > 3.5 && username.length > 6) {
    reasons.push('high_entropy_username')
  }
  
  // Mostly numbers mixed with letters (e.g. "86498eyezdev137")
  const digitRatio = (username.match(/\d/g) || []).length / username.length
  if (digitRatio > 0.3 && username.length > 5) {
    reasons.push('high_digit_ratio')
  }
  
  // Very short gibberish (e.g. "fnfpbp", "eg7vvb", "bmkncd")
  if (username.length <= 7 && !/[aeiou]{2}/i.test(username) && entropy > 2.5) {
    reasons.push('short_gibberish')
  }
  
  // All lowercase, no spaces, looks auto-generated
  if (username === username.toLowerCase() && username.length > 8 && !username.includes(' ') && /^[a-z0-9]+$/.test(username)) {
    reasons.push('auto_generated_pattern')
  }
  
  return {
    isRandom: reasons.length >= 1,
    entropy,
    reasons,
  }
}

// Check if message is a generic shill/bot phrase
function detectShillSignals(message: string): string[] {
  const signals: string[] = []
  const lower = message.toLowerCase().trim()
  
  for (const phrase of SHILL_PHRASES) {
    if (lower.includes(phrase)) {
      signals.push(`shill_phrase:${phrase}`)
    }
  }
  
  // Very short ambiguous message (< 30 chars, no specific content)
  if (lower.length < 30 && !lower.match(/\$[\d,.]+/)) {
    signals.push('short_generic_message')
  }
  
  // All caps excitement
  if (message.length > 5 && message === message.toUpperCase() && /[A-Z]/.test(message)) {
    signals.push('all_caps_hype')
  }
  
  return signals
}

// Hash a message for duplicate detection (normalize whitespace, lowercase)
async function hashMessage(message: string): Promise<string> {
  const normalized = message.toLowerCase().trim().replace(/\s+/g, ' ')
  const msgBuffer = new TextEncoder().encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  return encodeHex(new Uint8Array(hashBuffer)).slice(0, 32)
}

// Parse comments from scraped markdown
function parseCommentsFromMarkdown(markdown: string): Array<{ username: string; message: string; age?: string; hearts?: number }> {
  const comments: Array<{ username: string; message: string; age?: string; hearts?: number }> = []
  
  // Pump.fun comments typically appear as structured text in markdown
  // Pattern: username + time, then message text, then hearts/reply
  const lines = markdown.split('\n').filter(l => l.trim())
  
  let currentUsername = ''
  let currentAge = ''
  let currentMessage = ''
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Skip navigation/UI elements
    if (line.startsWith('#') || line.includes('Add a comment') || line === 'Reply' || 
        line === 'Older activity' || line.includes('Newest') || line.includes('Comments') && line.includes('Trades')) {
      continue
    }
    
    // Match username + time pattern (e.g., "fnfpbp 55m" or "blake gem 1h")
    const userTimeMatch = line.match(/^([a-zA-Z0-9_.\s]+?)\s+(\d+[smhd])\s*$/)
    if (userTimeMatch) {
      // Save previous comment if exists
      if (currentUsername && currentMessage) {
        comments.push({
          username: currentUsername.trim(),
          message: currentMessage.trim(),
          age: currentAge,
        })
      }
      currentUsername = userTimeMatch[1]
      currentAge = userTimeMatch[2]
      currentMessage = ''
      continue
    }
    
    // Skip hearts count line
    if (/^[♡❤️🤍]\s*\d+$/.test(line) || /^\d+$/.test(line)) {
      continue
    }
    
    // If we have a username, accumulate message
    if (currentUsername && line !== 'Reply') {
      if (currentMessage) currentMessage += ' '
      currentMessage += line
    }
  }
  
  // Don't forget last comment
  if (currentUsername && currentMessage) {
    comments.push({
      username: currentUsername.trim(),
      message: currentMessage.trim(),
      age: currentAge,
    })
  }
  
  return comments
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY')
    const supabase = createClient(supabaseUrl, supabaseKey)

    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { tokenMint, tokenSymbol, batchMode, limit: batchLimit } = await req.json()

    // Determine which tokens to scan
    let tokensToScan: Array<{ token_mint: string; token_symbol: string; creator_wallet?: string }> = []

    if (tokenMint) {
      tokensToScan = [{ token_mint: tokenMint, token_symbol: tokenSymbol || 'UNKNOWN' }]
    } else if (batchMode) {
      // Batch: scan recent watching/qualified tokens that haven't been comment-scanned
      const { data: watchlistTokens } = await supabase
        .from('pumpfun_watchlist')
        .select('token_mint, token_symbol, creator_wallet')
        .in('status', ['watching', 'qualified', 'buy_now'])
        .is('comment_scan_at', null)
        .order('created_at', { ascending: false })
        .limit(batchLimit || 10)

      tokensToScan = watchlistTokens || []
    }

    if (tokensToScan.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tokens to scan', scanned: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`🔍 Scanning comments for ${tokensToScan.length} tokens`)

    const results: Array<{
      tokenMint: string
      tokenSymbol: string
      commentsFound: number
      botsDetected: number
      duplicatesFound: number
      botScore: number
    }> = []

    for (const token of tokensToScan) {
      try {
        const url = `https://pump.fun/coin/${token.token_mint}`
        console.log(`📝 Scraping comments for ${token.token_symbol}: ${url}`)

        // Scrape with Firecrawl - wait for JS to render comments
        const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 3000, // Wait 3s for comments to load
          }),
        })

        if (!scrapeResponse.ok) {
          console.error(`Firecrawl failed for ${token.token_symbol}: ${scrapeResponse.status}`)
          continue
        }

        const scrapeData = await scrapeResponse.json()
        const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || ''

        if (!markdown) {
          console.log(`No markdown content for ${token.token_symbol}`)
          continue
        }

        // Parse comments from scraped content
        const comments = parseCommentsFromMarkdown(markdown)
        console.log(`Found ${comments.length} comments for ${token.token_symbol}`)

        let botsDetected = 0
        let duplicatesFound = 0
        let totalBotSignals = 0

        for (const comment of comments) {
          const msgHash = await hashMessage(comment.message)
        const usernameAnalysis = isRandomUsername(comment.username)
          const shillSignals = detectShillSignals(comment.message)
          // NOTE: Username entropy is NOT a bot signal — pump.fun assigns random names by default
          // We still collect entropy as metadata but don't use it for detection
          const allBotSignals = [...shillSignals]

          // Check for duplicate messages across ALL tokens
          const { data: existingDuplicates } = await supabase
            .from('pumpfun_token_comments')
            .select('id, token_mint, username')
            .eq('message_hash', msgHash)
            .neq('token_mint', token.token_mint)
            .limit(5)

          const isDuplicate = (existingDuplicates?.length || 0) > 0
          if (isDuplicate) {
            duplicatesFound++
            allBotSignals.push(`duplicate_across_tokens:${existingDuplicates!.length}`)
          }

          // Also check same-token duplicates (copy-paste within same comment section)
          const { data: sameTokenDupes } = await supabase
            .from('pumpfun_token_comments')
            .select('id')
            .eq('message_hash', msgHash)
            .eq('token_mint', token.token_mint)
            .limit(1)

          const isSameTokenDupe = (sameTokenDupes?.length || 0) > 0

          if (allBotSignals.length > 0) {
            botsDetected++
            totalBotSignals += allBotSignals.length
          }

          // Upsert comment account
          const { data: existingAccount } = await supabase
            .from('pumpfun_comment_accounts')
            .select('id, tokens_commented_on, total_comments, duplicate_message_count, flagged_reasons, linked_creator_wallets')
            .eq('username', comment.username)
            .maybeSingle()

          let accountId: string | null = null

          if (existingAccount) {
            accountId = existingAccount.id
            const existingReasons = existingAccount.flagged_reasons || []
            const mergedReasons = [...new Set([...existingReasons, ...allBotSignals])]
            const newLinkedWallets = existingAccount.linked_creator_wallets || []
            if (token.creator_wallet && !newLinkedWallets.includes(token.creator_wallet)) {
              newLinkedWallets.push(token.creator_wallet)
            }

            await supabase
              .from('pumpfun_comment_accounts')
              .update({
                total_comments: existingAccount.total_comments + 1,
                tokens_commented_on: existingAccount.tokens_commented_on + 1,
                duplicate_message_count: existingAccount.duplicate_message_count + (isDuplicate ? 1 : 0),
                is_flagged_bot: allBotSignals.length >= 2 || existingAccount.tokens_commented_on >= 3,
                bot_confidence_score: Math.min(100, (mergedReasons.length * 15) + (existingAccount.tokens_commented_on * 10)),
                username_entropy_score: usernameAnalysis.entropy,
                flagged_reasons: mergedReasons,
                linked_creator_wallets: newLinkedWallets,
                last_seen_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingAccount.id)
          } else {
            const linkedWallets = token.creator_wallet ? [token.creator_wallet] : []
            const { data: newAccount } = await supabase
              .from('pumpfun_comment_accounts')
              .insert({
                username: comment.username,
                is_flagged_bot: allBotSignals.length >= 2,
                bot_confidence_score: Math.min(100, allBotSignals.length * 15),
                username_entropy_score: usernameAnalysis.entropy,
                flagged_reasons: allBotSignals,
                linked_creator_wallets: linkedWallets,
              })
              .select('id')
              .single()

            accountId = newAccount?.id || null
          }

          // Insert comment (skip if same-token dupe already stored)
          if (!isSameTokenDupe) {
            await supabase
              .from('pumpfun_token_comments')
              .insert({
                token_mint: token.token_mint,
                token_symbol: token.token_symbol,
                username: comment.username,
                message: comment.message,
                message_hash: msgHash,
                comment_age: comment.age,
                is_duplicate: isDuplicate,
                duplicate_of_id: isDuplicate ? existingDuplicates![0].id : null,
                bot_signals: allBotSignals,
                account_id: accountId,
              })
          }
        }

        // Calculate bot score for this token (0-100)
        const botScore = comments.length > 0
          ? Math.min(100, Math.round(
              (botsDetected / comments.length) * 50 +
              (duplicatesFound / Math.max(comments.length, 1)) * 30 +
              (totalBotSignals / Math.max(comments.length, 1)) * 20
            ))
          : 0

        // Update watchlist with bot score
        await supabase
          .from('pumpfun_watchlist')
          .update({
            comment_bot_score: botScore,
            comment_scan_at: new Date().toISOString(),
          })
          .eq('token_mint', token.token_mint)

        results.push({
          tokenMint: token.token_mint,
          tokenSymbol: token.token_symbol || 'UNKNOWN',
          commentsFound: comments.length,
          botsDetected,
          duplicatesFound,
          botScore,
        })

        console.log(`✅ ${token.token_symbol}: ${comments.length} comments, ${botsDetected} bots, ${duplicatesFound} dupes, score=${botScore}`)

        // Rate limit - wait between tokens
        if (tokensToScan.length > 1) {
          await new Promise(r => setTimeout(r, 1000))
        }
      } catch (tokenError) {
        console.error(`Error scanning ${token.token_symbol}:`, tokenError)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: results.length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Comment scanner error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
