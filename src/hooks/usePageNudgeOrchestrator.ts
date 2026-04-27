import { useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { dispatchThoughtCustom } from '@/components/chat/AvatarThoughtBubble';

interface NudgeConfig {
  anonNudges: string[];
  authNudges: string[];
  scrollNudges?: { depth: number; text: string }[];
}

const PAGE_NUDGES: Record<string, NudgeConfig> = {
  '/': {
    anonNudges: [
      "sign up free — unlock AI analysis on every token",
      "500+ tokens tracked daily — want to see yours?",
      "paste any token address and get instant intel",
      "our Telegram bot is free too — try /quick",
    ],
    authNudges: [
      "try the Bubble Map — it maps hidden wallet networks",
      "check the Live Feed for the freshest tokens",
      "the AI risk engine runs on every scan you do",
      "link your Telegram for on-the-go intel",
    ],
    scrollNudges: [
      { depth: 25, text: "keep scrolling — the three product pillars are below" },
      { depth: 60, text: "pricing breakdown is just ahead" },
    ],
  },
  '/feed': {
    anonNudges: [
      "create a free account to unlock full analysis",
      "these tokens update every 12 hours in real-time",
      "this feed is free in our Telegram channel too",
      "sign up to save your searches and get alerts",
    ],
    authNudges: [
      "click any token for the deep breakdown",
      "sort by health grade to surface the strongest tokens",
      "the litmus strip shows 12-hour grade history",
      "try Bubble Map on any token — link is in the expanded row",
    ],
  },
  '/holders': {
    anonNudges: [
      "sign up to save your analysis history",
      "this is the free preview — imagine what Pro unlocks",
      "paste a token address above and hit analyze",
    ],
    authNudges: [
      "try the AI tab for a full narrative analysis",
      "the wallet tab traces dev history and reputation",
      "check the Analysis Overview tab for methodology",
    ],
  },
  '/subscriptions': {
    anonNudges: [
      "X subscribers save on every paid plan",
      "anon get 1 Trace/day · sign up free for 3/day · Pro for unlimited",
      "free account unlocks AI analysis and whale warnings",
    ],
    authNudges: [
      "Pro unlocks unlimited bubble maps and deep intel",
      "the AI risk engine catches what manual scanning misses",
      "you can upgrade anytime — no lock-in, cancel monthly",
    ],
    scrollNudges: [
      { depth: 50, text: "detailed plan comparison is just below" },
    ],
  },
  '/pricing': {
    anonNudges: [
      "curious about Pro? just ask me — I'll break it down",
      "X subscribers get a discount on every paid tier",
      "free tier includes AI summary and health grade",
    ],
    authNudges: [
      "you can upgrade anytime — billing is through Stripe",
      "Pro gives you unlimited scans across web + Telegram",
    ],
  },
  '/bubblepromo': {
    anonNudges: [
      "1 free Trace/day for visitors — sign up free to get 3/day",
      "paste any Solana token address above to start",
      "sign up free for full access to the Bubble Map tool",
    ],
    authNudges: [], // redirects to /bubblemap for auth users
  },
  '/bubblemap': {
    anonNudges: [],
    authNudges: [
      "try Deep Spider for the full wallet mesh",
      "switch views with Solar Clusters for a different perspective",
      "Find KYC Root traces the funding chain to exchanges",
      "use the mini map to navigate large cluster views",
    ],
  },
  '/tgbot': {
    anonNudges: [
      "the bot works in group chats too — great for communities",
      "try /quick in Telegram — it's instant and free",
      "create an account to unlock advanced bot commands",
    ],
    authNudges: [
      "link your Telegram in Settings for cross-platform intel",
      "your subscription tier carries over to the bot automatically",
      "channel admins can install the bot for their community",
    ],
  },
};

function pickRandom(arr: string[]): string | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function matchRoute(pathname: string): NudgeConfig | null {
  // Exact match first
  if (PAGE_NUDGES[pathname]) return PAGE_NUDGES[pathname];
  // Prefix match for nested routes
  for (const route of Object.keys(PAGE_NUDGES)) {
    if (route !== '/' && pathname.startsWith(route)) return PAGE_NUDGES[route];
  }
  return null;
}

interface OrchestratorOptions {
  nudgesEnabled: boolean;
  isOpen: boolean;
  fabVisible: boolean;
}

export function usePageNudgeOrchestrator({ nudgesEnabled, isOpen, fabVisible }: OrchestratorOptions) {
  const location = useLocation();
  const { user } = useAuth();
  const nudgeCount = useRef(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFired = useRef<Set<number>>(new Set());
  const lastRoute = useRef(location.pathname);
  const usedNudges = useRef<Set<string>>(new Set());

  const isAdmin = user?.email === 'admin@blackbox.farm';
  const MAX_NUDGES = isAdmin ? 999 : 4;
  const INITIAL_DELAY = isAdmin ? 5_000 : 10_000;
  const REPEAT_DELAY = isAdmin ? 8_000 : 18_000;

  // Reset on route change
  useEffect(() => {
    if (location.pathname !== lastRoute.current) {
      lastRoute.current = location.pathname;
      nudgeCount.current = 0;
      scrollFired.current.clear();
      usedNudges.current.clear();
    }
  }, [location.pathname]);

  // Idle-based nudges
  useEffect(() => {
    if (!nudgesEnabled || isOpen || !fabVisible) return;

    const config = matchRoute(location.pathname);
    if (!config) return;

    const pool = user ? config.authNudges : config.anonNudges;
    if (!pool.length) return;

    const fireNudge = () => {
      if (nudgeCount.current >= MAX_NUDGES) return;
      // Pick a nudge not yet used this page visit
      const available = pool.filter(n => !usedNudges.current.has(n));
      const text = pickRandom(available.length ? available : pool);
      if (!text) return;
      usedNudges.current.add(text);
      nudgeCount.current++;
      dispatchThoughtCustom(text);
    };

    // Initial nudge after delay
    idleTimer.current = setTimeout(() => {
      fireNudge();
      // Subsequent nudges on interval
      intervalTimer.current = setInterval(() => {
        if (nudgeCount.current >= MAX_NUDGES) {
          if (intervalTimer.current) clearInterval(intervalTimer.current);
          return;
        }
        fireNudge();
      }, REPEAT_DELAY);
    }, INITIAL_DELAY);

    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (intervalTimer.current) clearInterval(intervalTimer.current);
    };
  }, [location.pathname, nudgesEnabled, isOpen, fabVisible, user]);

  // Scroll-based nudges
  useEffect(() => {
    if (!nudgesEnabled || isOpen || !fabVisible) return;

    const config = matchRoute(location.pathname);
    if (!config?.scrollNudges?.length) return;

    const handleScroll = () => {
      if (nudgeCount.current >= MAX_NUDGES) return;
      const scrollPct = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;

      for (const sn of config.scrollNudges!) {
        if (scrollPct >= sn.depth && !scrollFired.current.has(sn.depth)) {
          scrollFired.current.add(sn.depth);
          nudgeCount.current++;
          dispatchThoughtCustom(sn.text);
          break; // one at a time
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname, nudgesEnabled, isOpen, fabVisible]);
}
