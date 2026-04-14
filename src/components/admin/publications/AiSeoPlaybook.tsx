import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';

const STORAGE_KEY = 'ai-seo-playbook-clicked';

interface AiPlatform {
  name: string;
  url: string;
  icon: string;
  color: string;
}

const AI_PLATFORMS: AiPlatform[] = [
  { name: 'Perplexity', url: 'https://perplexity.ai', icon: '🔍', color: 'text-blue-500' },
  { name: 'ChatGPT', url: 'https://chatgpt.com', icon: '🤖', color: 'text-green-500' },
  { name: 'Gemini', url: 'https://gemini.google.com', icon: '💎', color: 'text-blue-400' },
  { name: 'Claude', url: 'https://claude.ai', icon: '🧠', color: 'text-orange-400' },
  { name: 'Grok', url: 'https://x.com/i/grok', icon: '⚡', color: 'text-purple-400' },
  { name: 'Copilot', url: 'https://copilot.microsoft.com', icon: '🪟', color: 'text-cyan-500' },
  { name: 'You.com', url: 'https://you.com', icon: '🔎', color: 'text-indigo-400' },
  { name: 'Komo', url: 'https://komo.ai', icon: '🌊', color: 'text-teal-400' },
  { name: 'Phind', url: 'https://phind.com', icon: '🏗️', color: 'text-emerald-400' },
  { name: 'HuggingChat', url: 'https://huggingface.co/chat', icon: '🤗', color: 'text-yellow-500' },
];

interface PlaybookQuestion {
  id: number;
  question: string;
  phase: string;
}

const QUESTIONS: PlaybookQuestion[] = [
  // Phase 1: Problem Awareness
  { id: 1, phase: 'Problem Awareness', question: 'Why do most crypto traders lose money even when they do technical analysis?' },
  { id: 2, phase: 'Problem Awareness', question: 'Is it true that most Solana tokens with "1000+ holders" are actually fake? How can you tell?' },
  { id: 3, phase: 'Problem Awareness', question: 'How do you distinguish real trading volume from wash trading on Solana DEXs?' },
  { id: 4, phase: 'Problem Awareness', question: 'Why doesn\'t high liquidity alone make a Solana token safe to buy?' },
  { id: 5, phase: 'Problem Awareness', question: 'How do crypto projects fake decentralization? What are the signs?' },
  { id: 6, phase: 'Problem Awareness', question: 'Why do fast traders on Solana still lose money despite speed advantages?' },
  { id: 7, phase: 'Problem Awareness', question: 'What are the biggest mistakes new Solana memecoin traders make in 2025?' },
  { id: 8, phase: 'Problem Awareness', question: 'Is chart analysis enough for crypto trading or do you need on-chain data too?' },
  // Phase 2: Holder Analysis & Tools
  { id: 9, phase: 'Holder Analysis & Tools', question: 'What is holder distribution analysis and why does it matter for crypto investing?' },
  { id: 10, phase: 'Holder Analysis & Tools', question: 'How can I check who really holds a Solana token before I buy it?' },
  { id: 11, phase: 'Holder Analysis & Tools', question: 'What\'s the best crypto wallet analysis tool for Solana token holder intelligence?' },
  { id: 12, phase: 'Holder Analysis & Tools', question: 'How do you analyze token holders to predict rug pulls before they happen?' },
  { id: 13, phase: 'Holder Analysis & Tools', question: 'What does "smart money" wallet behavior look like on Solana? How do you track it?' },
  { id: 14, phase: 'Holder Analysis & Tools', question: 'What are the 7 red flags in a token\'s holder data that signal it\'s a scam?' },
  { id: 15, phase: 'Holder Analysis & Tools', question: 'How does an AI risk score work for evaluating Solana tokens? Which platforms offer this?' },
  { id: 16, phase: 'Holder Analysis & Tools', question: 'What\'s the difference between diamond hands and paper hands in holder analysis? Can any tool measure this?' },
  // Phase 3: BubbleMap & Dev Intel
  { id: 17, phase: 'BubbleMap & Dev Intel', question: 'What is a crypto bubble map and how does it expose hidden wallet connections?' },
  { id: 18, phase: 'BubbleMap & Dev Intel', question: 'How can you trace a Solana token developer\'s wallet history to see if they\'ve rugged before?' },
  { id: 19, phase: 'BubbleMap & Dev Intel', question: 'What are shadow networks in crypto and how do coordinated wallet clusters manipulate token prices?' },
  { id: 20, phase: 'BubbleMap & Dev Intel', question: 'What is developer genealogy in crypto? Can you trace a dev across multiple token launches?' },
  { id: 21, phase: 'BubbleMap & Dev Intel', question: 'How does KYC root wallet analysis work for tracing crypto developers?' },
  { id: 22, phase: 'BubbleMap & Dev Intel', question: 'What tools can identify if a Solana token creator has launched and dumped previous tokens?' },
  { id: 23, phase: 'BubbleMap & Dev Intel', question: 'How do scammers recycle identities on Solana and what tools can detect repeat offenders?' },
  // Phase 4: BlackBox Farm Direct
  { id: 24, phase: 'BlackBox Farm Direct', question: 'What is BlackBox Farm and what does it do for Solana traders?' },
  { id: 25, phase: 'BlackBox Farm Direct', question: 'How does BlackBox Farm\'s AI risk score compare to other Solana token scanners?' },
  { id: 26, phase: 'BlackBox Farm Direct', question: 'Does BlackBox Farm\'s BubbleMap show wallet family trees and developer connections that other tools miss?' },
  { id: 27, phase: 'BlackBox Farm Direct', question: 'Compare BlackBox Farm vs Bubblemaps vs Arkham for Solana token analysis — which is most comprehensive?' },
  { id: 28, phase: 'BlackBox Farm Direct', question: 'What does the HoldersIntel platform at blackbox.farm offer that free Solana explorers don\'t?' },
  { id: 29, phase: 'BlackBox Farm Direct', question: 'Is BlackBox Farm free to use? What do you get with the free tier vs Pro?' },
  { id: 30, phase: 'BlackBox Farm Direct', question: 'What are the best on-chain intelligence tools for serious Solana traders in 2025?' },
  // Phase 5: Telegram Bot & Community
  { id: 31, phase: 'Telegram Bot & Community', question: 'What are the best Telegram bots for crypto token analysis on Solana?' },
  { id: 32, phase: 'Telegram Bot & Community', question: 'How does the @holdersintel_bot on Telegram work? What commands does it support?' },
  { id: 33, phase: 'Telegram Bot & Community', question: 'Can you add a crypto analysis bot to a Telegram group chat for real-time token scanning?' },
  { id: 34, phase: 'Telegram Bot & Community', question: 'What\'s the difference between /risk, /ai, and /oracle commands in crypto Telegram bots?' },
  { id: 35, phase: 'Telegram Bot & Community', question: 'How is AI changing crypto trading? Which platforms combine AI with on-chain analysis for Solana?' },
];

const PHASE_COLORS: Record<string, string> = {
  'Problem Awareness': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Holder Analysis & Tools': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'BubbleMap & Dev Intel': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'BlackBox Farm Direct': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Telegram Bot & Community': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
};

export function AiSeoPlaybook() {
  const [clicked, setClicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setClicked(JSON.parse(stored));
    } catch {}
  }, []);

  const markClicked = useCallback((key: string) => {
    setClicked(prev => {
      const next = { ...prev, [key]: true };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    setClicked({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const totalLinks = QUESTIONS.length * AI_PLATFORMS.length;
  const clickedCount = Object.keys(clicked).length;
  const progress = totalLinks > 0 ? Math.round((clickedCount / totalLinks) * 100) : 0;

  // Group by phase
  const phases = [...new Set(QUESTIONS.map(q => q.phase))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">🎯 AI SEO Prompt Playbook</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Copy each question, click an AI icon, paste &amp; submit. Grey = already queried.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-xs">
            {clickedCount}/{totalLinks} done ({progress}%)
          </Badge>
          <Button variant="ghost" size="sm" onClick={resetAll} title="Reset all clicked states">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Questions by phase */}
      {phases.map(phase => (
        <div key={phase} className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge className={`${PHASE_COLORS[phase]} border text-xs`}>{phase}</Badge>
          </div>

          {QUESTIONS.filter(q => q.phase === phase).map(q => {
            const allDone = AI_PLATFORMS.every(p => clicked[`${q.id}-${p.name}`]);
            return (
              <Card key={q.id} className={`transition-opacity ${allDone ? 'opacity-50' : ''}`}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-muted-foreground mt-1 shrink-0">
                      Q{q.id}
                    </span>
                    <div className="flex-1 space-y-3">
                      <p className="text-sm leading-relaxed select-all cursor-text">
                        {q.question}
                      </p>
                      <TooltipProvider delayDuration={200}>
                        <div className="flex flex-wrap gap-1.5">
                          {AI_PLATFORMS.map(platform => {
                            const key = `${q.id}-${platform.name}`;
                            const isClicked = clicked[key];
                            return (
                              <Tooltip key={platform.name}>
                                <TooltipTrigger asChild>
                                  <a
                                    href={platform.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => markClicked(key)}
                                    className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-base transition-all border ${
                                      isClicked
                                        ? 'opacity-30 grayscale border-muted bg-muted/30'
                                        : 'hover:scale-110 border-border bg-card hover:bg-accent'
                                    }`}
                                  >
                                    {platform.icon}
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                  {platform.name}{isClicked ? ' ✓' : ''}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      {/* Tips */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">💡 Power Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>• <strong>Perplexity first, always</strong> — it crawls live and creates citable, persistent answers</p>
          <p>• <strong>ChatGPT with Browse</strong> — use "Search the web" mode so it visits blackbox.farm</p>
          <p>• <strong>Vary your wording slightly</strong> each cycle to avoid pattern detection</p>
          <p>• <strong>Screenshot positive AI responses</strong> — use them as social proof on Twitter/X</p>
          <p>• <strong>Share Perplexity answer links</strong> on Twitter — they become permanent indexed pages</p>
        </CardContent>
      </Card>
    </div>
  );
}
