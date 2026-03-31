

# Generate Public Website Content Overview File

## What
Create a single HTML/text file at `/mnt/documents/` containing all public-facing page content from BlackBox Farm, formatted for easy LLM consumption.

## Public Pages to Include (~25 pages)
From the routes, excluding SuperAdminRoute-protected and auth pages:

| Route | Page |
|-------|------|
| `/` | Home |
| `/about` | About Us |
| `/contact` | Contact Us |
| `/whitepaper` | White Paper |
| `/terms` | Terms of Service |
| `/tos` | TOS |
| `/privacy` | Privacy Policy |
| `/cookies` | Cookies Policy |
| `/email-abuse` | Email Abuse Policy |
| `/web3-manifesto` | Web3 Manifesto |
| `/holders` | Holders Tool |
| `/holders-marketing` | Holders Marketing |
| `/holders-info` | Holders Landing |
| `/holders-bot` | Holders Bot Landing |
| `/holders-how-to` | Holders How To |
| `/demo` | Demo |
| `/pricing` | Pricing |
| `/features` | Features |
| `/security` | Security |
| `/api` | API Landing |
| `/api-docs` | API Docs Landing |
| `/ai-analysis` | AI Analysis |
| `/bumpbot` | Bump Bot Landing |
| `/volumebot` | Volume Bot Landing |
| `/tgbot` | Telegram Bot |
| `/bubblepromo` | Bubble Promo |
| `/bubblemap` | Bubble Map |
| `/bubbles-how-to` | Bubbles How To |
| `/adverts` | Adverts |
| `/buy-banner` | Buy Banner |
| `/competitive-analysis` | Competitive Analysis |

## Approach
1. Read each public page component to extract text content
2. Compile into a single well-structured HTML file with a table of contents
3. Each page gets a section with its route, title, and all visible text/content
4. Strip React/JSX — output clean readable text with basic HTML formatting
5. Save to `/mnt/documents/blackbox-farm-website-overview.html`

## Output Format
```html
<html>
<head><title>BlackBox Farm — Full Website Content Overview</title></head>
<body>
  <h1>BlackBox Farm — Public Website Content</h1>
  <nav>Table of Contents (linked)</nav>
  
  <section id="home">
    <h2>/ — Home</h2>
    <p>...extracted content...</p>
  </section>
  
  <section id="about">
    <h2>/about — About Us</h2>
    <p>...extracted content...</p>
  </section>
  <!-- etc -->
</body>
</html>
```

## Technical Details
- Read all ~30 page files to extract JSX text content
- Convert JSX text nodes, headings, lists, paragraphs into clean HTML
- Omit component logic, state management, API calls — just the user-facing copy
- Single deliverable file for Claude/ChatGPT ingestion

