# Token Identity & Launchpad Tracking

## Overview
This document explains how the system handles token identity, liquidity pools, and launchpad detection.

## 1. LP Tokens vs Original (OG) Tokens

### The Problem
When a token launches on pump.fun and later creates a liquidity pool on Meteora or Raydium, it can be confusing to track which is the "original" token.

### The Solution
**The token mint address is the source of truth.** Here's how it works:

- **Original Token**: Has a unique mint address (e.g., `ABC...XYZ`)
- **Trading Pair/LP**: Created on Raydium/Meteora with a `pair_address`, but the token mint stays the same
- **What We Track**:
  - `token_mint`: The original, immutable token address
  - `pair_address`: The trading pair address (changes per DEX)
  - `dex_id`: Which DEX (raydium, meteora, etc.)

**Example Flow:**
1. Token `TKN123...` launches on pump.fun
2. Dev creates LP on Raydium → Gets new `pair_address: RAY456...`
3. Dev creates LP on Meteora → Gets new `pair_address: MET789...`
4. **All three share the same `token_mint: TKN123...`** ✅

The system tracks all pairs but groups them by the original token mint, showing you the token's complete trading history across all DEXes.

## 2. Identifying Original (OG) Tokens vs Copycats

### The Challenge
Scammers copy names, symbols, and images to create "pump and dump" versions of successful tokens.

### How We Detect OG Tokens

#### Primary Identifier: Token Mint Address
- Each token has a **unique, immutable mint address**
- Copycats CANNOT use the same mint address
- Even if they steal the name/image, their mint address will be different

#### Secondary Indicators:
1. **First Seen Timestamp** (`first_seen_at`):
   - The earliest creation date for a token with that name/symbol
   - The OG will have the earliest timestamp
   
2. **Launchpad Detection**:
   - Track where token was originally launched
   - Original pump.fun tokens have official pump.fun markers
   
3. **Creator Wallet** (`creator_wallet`):
   - Links token to the developer's master wallet
   - Helps identify if same dev created multiple versions

### Example Comparison:

```
Token A (OG):
- mint: ABC123XYZ
- name: "MoonCoin"
- created: 2024-01-01
- creator: wallet_A
- launchpad: pump.fun

Token B (Copycat):
- mint: DEF456UVW  ⚠️ DIFFERENT
- name: "MoonCoin"  ⚠️ SAME (scam!)
- created: 2024-01-15  ⚠️ LATER
- creator: wallet_B  ⚠️ DIFFERENT
- launchpad: raydium
```

## 3. Launchpad Detection & Display

### Supported Launchpads
The system now tracks and displays launchpad sources with icons:

- 🟣 **pump.fun** - Most popular meme coin launchpad
- 🟡 **bonk.fun** - Bonk ecosystem launchpad
- 💼 **bags.fm** - Community-driven launchpad
- 🔵 **raydium** - Direct Raydium launches

### Detection Logic

The system detects launchpads using multiple signals:

```typescript
// From DexScreener API data
1. URL patterns (pair.url includes 'pump.fun')
2. Website links (pair.info.websites includes launchpad)
3. DEX ID (pair.dexId === 'raydium')
```

### Database Schema
Added `launchpad` column to:
- `token_lifecycle` - Main token tracking table
- `scraped_tokens` - HTML-scraped tokens
- `developer_tokens` - Developer token history

### UI Display
Launchpad information shows in all token tables:
- **Icon**: Visual logo for instant recognition
- **Text**: Launchpad name
- **Placement**: Between Token Address and Raydium Date columns

## Best Practices for Token Verification

### ✅ Always Verify:
1. **Token Mint Address** - The only guaranteed unique identifier
2. **First Seen Date** - Earlier = more likely to be original
3. **Creator Wallet** - Check developer reputation
4. **Launchpad** - Official launchpads are more trustworthy
5. **Social Links** - Verify against official sources

### ⚠️ Red Flags:
- Recently created token with popular name
- Different creator wallet than known OG
- No official launchpad association
- Missing or suspicious social links
- Very similar but slightly different name

## Technical Implementation

### Data Flow:
1. **Discovery**: DexScreener scraper finds tokens
2. **Enrichment**: `enrich-scraped-tokens` adds metadata
3. **Launchpad Detection**: Pattern matching on API data
4. **Storage**: Saved to `token_lifecycle` and `scraped_tokens`
5. **Display**: UI components show icons and labels

### Cron Jobs:
- `dexscreener-top-200-scraper`: Runs every 5 minutes
- Automatically enriches new tokens
- Updates existing tokens with latest data
- Detects and stores launchpad information

## Future Enhancements

Potential improvements:
- Social verification (Twitter/Telegram)
- Community voting on "real" vs "copycat"
- Automated scam detection based on patterns
- Launchpad API integration for official verification
- Token family tree visualization
