

# Enhanced Article Rendering — Custom ReactMarkdown Components

## The Problem

Right now, `ReactMarkdown` renders the raw `.md` structure as-is with only Tailwind `prose` utility classes for basic typography. This produces a flat, blog-post-looking output. The user wants the articles to look like a **professionally designed publication page** — with styled section headings, visual dividers, proper spacing, pull-quote styling, and images that sit within the flow like a magazine layout.

## The Solution

Override ReactMarkdown's default element renderers with custom React components that apply rich, publication-grade styling. This applies to both the **public article page** (`IntelBriefingArticle.tsx`) and the **admin preview** (`IntelBriefingsManager.tsx`).

### Custom Component Overrides

| Element | Current | Enhanced |
|---------|---------|----------|
| `h1` | Basic bold text | Large display heading with accent underline bar, extra top margin |
| `h2` | Basic bold text | Section heading with left cyan border accent, uppercase tracking, spacing |
| `h3` | Basic bold text | Styled subheading with muted accent color |
| `p` | Flat paragraph | Proper line-height (1.8), comfortable paragraph spacing, first-paragraph drop-cap or lead styling |
| `blockquote` | Thin border-left | Styled pull-quote with background card, larger italic text, accent border |
| `img` | Float left/right alternating | Wrapped in a styled figure with rounded corners, subtle border/shadow, caption support via alt text, alternating float with proper clearfix segments |
| `hr` | Plain line | Decorative divider (centered dots or gradient line) |
| `ul`/`ol` | Basic list | Styled list with custom bullet/number colors, comfortable spacing |
| `strong` | Just bold | Bold + slightly brighter foreground color |
| `a` | Primary color link | Underline-on-hover with subtle transition |
| `table` | Basic table | Styled card-wrapped table with header highlights |

### Implementation

Create a shared component file `src/components/intel/ArticleMarkdownRenderer.tsx` that:
1. Exports a `markdownComponents` object for ReactMarkdown's `components` prop
2. Exports an `ArticleContent` wrapper component that applies the prose container styling
3. Handles image float logic more intelligently — images get wrapped in `<figure>` with alt text as captions, float alternation uses a counter via React state

### Files to Edit

| Action | File | What |
|--------|------|------|
| Create | `src/components/intel/ArticleMarkdownRenderer.tsx` | Custom component overrides + wrapper |
| Edit | `src/pages/IntelBriefingArticle.tsx` | Use `ArticleContent` component instead of raw ReactMarkdown |
| Edit | `src/components/admin/IntelBriefingsManager.tsx` | Use same renderer in admin preview |

No database or dependency changes needed — `react-markdown` already supports the `components` prop.

