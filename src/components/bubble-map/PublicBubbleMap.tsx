import React, { useRef, useCallback, useState, useEffect, useMemo } from "react";
import ForceGraph2D from "react-force-graph-2d";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMeshGraph, ENTITY_COLORS, ENTITY_LABELS, MeshNode } from "@/hooks/useMeshGraph";
import { Search, RotateCcw, Radar, AlertTriangle, ChevronDown, ChevronUp, Network, GitBranch, Key, Coins, Loader2, Unlock, Lock, Crown, ExternalLink, SearchCheck, Plus, Minus, Copy, Check, Sun, Orbit } from "lucide-react";
import { xIcon } from "@/components/token/SocialIcon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBubbleMapRateLimit } from "@/hooks/useBubbleMapRateLimit";
import { useNavigate } from "react-router-dom";
import HackerTerminal, { TerminalLine } from "./HackerTerminal";
import SocialTimeline from "./SocialTimeline";

type ViewMode = 'bubble' | 'tree';
type SolarMode = 'minimum' | 'clusters';
const NODE_CAP_DEFAULT = 80;
const NODE_CAP_MOBILE = 40;
const isMobileDevice = () => typeof window !== 'undefined' && window.innerWidth < 768;

interface PublicBubbleMapProps {
  showUpgradePrompt?: boolean;
  mode: 'promo' | 'authenticated';
}

const PublicBubbleMap = ({ showUpgradePrompt = false, mode }: PublicBubbleMapProps) => {
  const navigate = useNavigate();
  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [hoveredNode, setHoveredNode] = useState<MeshNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('bubble');
  const [kycSearching, setKycSearching] = useState(false);
  const [kycFound, setKycFound] = useState(false);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [nodeCap, setNodeCap] = useState(isMobileDevice() ? NODE_CAP_MOBILE : NODE_CAP_DEFAULT);
  const isMobile = isMobileDevice();
  const [capBroken, setCapBroken] = useState(false);
  const [communitySearching, setCommunitySearching] = useState(false);
  const [spreadFactor, setSpreadFactor] = useState(3);
  const [solarMode, setSolarMode] = useState<SolarMode>('minimum');
  const [hasSpideredOnce, setHasSpideredOnce] = useState(false);
  const [devWalletAddress, setDevWalletAddress] = useState<string | null>(null);
  const [devWalletLoading, setDevWalletLoading] = useState(false);

  // Showmanship state
  const [xAccountsRevealed, setXAccountsRevealed] = useState(false);
  const [revealingXAccounts, setRevealingXAccounts] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [terminalVisible, setTerminalVisible] = useState(false);
  const [terminalTitle, setTerminalTitle] = useState('ORACLE TRACE');

  const { canSearch, remaining, limit, isSubscriber, isLimited, recordSearch, isAuthenticated } = useBubbleMapRateLimit();

  const {
    graphData, isLoading, focusedEntity, focusOnEntity,
    expandEntity, resetView, typeFilters, toggleTypeFilter,
    spiderStatus, triggerSpider, refetch, autoDiscoverCommunity, clearCooldown,
  } = useMeshGraph();

  // --- Terminal helpers ---
  const addTerminalLine = useCallback((text: string, type: TerminalLine['type'] = 'info') => {
    setTerminalLines(prev => [...prev, { text, type, timestamp: Date.now() }]);
  }, []);

  const clearTerminal = useCallback(() => {
    setTerminalLines([]);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: Math.max(entry.contentRect.height, 500) });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const prevViewModeRef = useRef<ViewMode>(viewMode);

  useEffect(() => {
    if (graphRef.current) {
      const sf = spreadFactor;
      const linkForce = graphRef.current.d3Force('link');
      if (linkForce) {
        linkForce.distance((link: any) => {
          const rel = link.relationship || '';
          let base: number;
          if (['admin_of', 'mod_of', 'co_mod', 'community_admin', 'community_mod'].includes(rel)) base = viewMode === 'tree' ? 25 : 15;
          else if (['created', 'created_by'].includes(rel)) base = viewMode === 'tree' ? 30 : 18;
          else if (['community_for', 'social_account'].includes(rel)) base = viewMode === 'tree' ? 45 : 28;
          else if (rel.includes('funded') || rel.includes('kyc') || rel.includes('is_kyc_root')) base = viewMode === 'tree' ? 35 : 22;
          else base = viewMode === 'tree' ? 50 : 35;
          return base * sf;
        }).strength((link: any) => {
          const rel = link.relationship || '';
          if (rel.includes('funded') || rel.includes('kyc') || rel.includes('created')) return 1.5;
          return 0.7;
        });
      }
      graphRef.current.d3Force('charge')?.strength((viewMode === 'tree' ? -150 : -50) * sf);
      
      // Custom collision force: enforce minimum 2.5 bubble-diameters gap
      const getNodeRadius = (node: any) => {
        const nodeSize = Math.max(4, Math.min((node.val || 1) * 3 + 3, 20));
        return nodeSize * 3 * Math.sqrt(sf);
      };
      graphRef.current.d3Force('collision', () => {
        const nodes = graphData.nodes as any[];
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            if (a.x == null || b.x == null) continue;
            const dx = b.x - a.x, dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const minDist = getNodeRadius(a) + getNodeRadius(b);
            if (dist < minDist) {
              const push = (minDist - dist) * 0.5;
              const nx = dx / dist, ny = dy / dist;
              a.vx -= nx * push * 0.05;
              a.vy -= ny * push * 0.05;
              b.vx += nx * push * 0.05;
              b.vy += ny * push * 0.05;
            }
          }
        }
      });
      
      // Add center gravity to keep the graph cohesive instead of flying apart
      graphRef.current.d3Force('center')?.strength(0.05);
      
      const padding = viewMode === 'tree' ? 20 : 40;
      const pushStrength = viewMode === 'tree' ? 1 : 2;
      const w = dimensions.width || 800;
      const h = 600;
      graphRef.current.d3Force('boundX', () => {
        graphData.nodes.forEach((node: any) => {
          if (node.x < padding) node.vx += pushStrength;
          if (node.x > w - padding) node.vx -= pushStrength;
        });
      });
      graphRef.current.d3Force('boundY', () => {
        graphData.nodes.forEach((node: any) => {
          if (node.y < padding) node.vy += pushStrength;
          if (node.y > h - padding) node.vy -= pushStrength;
        });
      });
      
      // Reheat on view mode or spread factor change
      graphRef.current.d3ReheatSimulation();
    }
  }, [graphData, viewMode, dimensions.width, spreadFactor]);

  // Auto-resolve dev wallet when a token mint is searched
  const [copiedDevWallet, setCopiedDevWallet] = useState(false);
  useEffect(() => {
    const input = searchInput.trim();
    if (!input || input.length < 20 || input.startsWith('@')) {
      setDevWalletAddress(null);
      return;
    }
    // Check from graph data first
    const devNode = graphData.nodes.find(n => n.type === 'wallet' && n.isDev);
    if (devNode) {
      setDevWalletAddress(devNode.fullId || devNode.id.replace(/^wallet:/, ''));
      return;
    }
    // If no dev node in graph yet, try API lookup
    if (!devWalletLoading && !devWalletAddress) {
      setDevWalletLoading(true);
      supabase.functions.invoke('solscan-creator-lookup', { body: { tokenMint: input } })
        .then(({ data }) => {
          if (data?.creatorWallet) setDevWalletAddress(data.creatorWallet);
        })
        .catch(() => {})
        .finally(() => setDevWalletLoading(false));
    }
  }, [searchInput, graphData.nodes]);

  // Reset reveal state on new search
  const handleSearch = useCallback(() => {
    if (!searchInput.trim()) {
      resetView();
      setXAccountsRevealed(false);
      setKycFound(false);
      setDevWalletAddress(null);
      return;
    }
    if (!canSearch) {
      toast.error("Daily limit reached! Sign up or subscribe for unlimited access.");
      return;
    }
    recordSearch();
    setXAccountsRevealed(false);
    setHasSpideredOnce(false);
    setDevWalletAddress(null);
    clearCooldown(searchInput.trim());
    let type = 'wallet';
    const rawInput = searchInput.trim();
    let normalizedId = rawInput;
    if (rawInput.startsWith('@')) {
      type = 'x_account';
      normalizedId = rawInput.replace(/^@/, '').toLowerCase();
    } else if (rawInput.length < 20) {
      type = 'token';
    }
    focusOnEntity(normalizedId, type);
    setNodeCap(NODE_CAP_DEFAULT);
    setCapBroken(false);
  }, [searchInput, focusOnEntity, resetView, canSearch, recordSearch, remaining, limit, isSubscriber, mode]);

  // Auto-spider: if we have a focused entity but zero nodes AND spider isn't active AND hasn't already run
  const spiderHasError = !!spiderStatus.error;
  const shouldOfferSpider = focusedEntity && !isLoading && graphData.nodes.length === 0 && !spiderStatus.active && !hasSpideredOnce;

  useEffect(() => {
    if (shouldOfferSpider && searchInput.trim() && !hasSpideredOnce) {
      triggerSpider(searchInput.trim(), isMobile ? 'quick' : 'deep');
      setHasSpideredOnce(true);
    }
  }, [shouldOfferSpider, searchInput, triggerSpider, hasSpideredOnce]);

  const handleSpider = useCallback(() => {
    if (!searchInput.trim()) return;
    // Clear cooldown so retry always works immediately
    clearCooldown(searchInput.trim());
    triggerSpider(searchInput.trim(), 'deep');
    setHasSpideredOnce(true);
  }, [searchInput, triggerSpider, clearCooldown]);

  // --- X Community discovery with showmanship ---
  const handleDiscoverCommunity = useCallback(async () => {
    const tokenNode = graphData.nodes.find(n => n.type === 'token');
    const tokenMint = tokenNode?.fullId || tokenNode?.id.replace(/^token:/, '') || searchInput.trim();
    if (!tokenMint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(tokenMint)) {
      toast.info('Enter a token mint address to discover its X Community');
      return;
    }

    // If we already have x_account nodes hidden — do the dramatic reveal instead
    const hiddenXAccounts = graphData.nodes.filter(n => n.type === 'x_account');
    if (hiddenXAccounts.length > 0 && !xAccountsRevealed) {
      setRevealingXAccounts(true);
      setTerminalTitle('X COMMUNITY SCANNER');
      setTerminalVisible(true);
      clearTerminal();

      // Dramatic terminal sequence
      const lines: Array<[string, TerminalLine['type'], number]> = [
        ['INITIATING X COMMUNITY SCAN...', 'info', 0],
        [`TARGET: ${tokenMint.slice(0, 16)}...`, 'info', 400],
        ['SCANNING SOCIAL GRAPH DATABASE...', 'info', 800],
        ['CROSS-REFERENCING COMMUNITY ROSTERS...', 'info', 1200],
        [`MATCH FOUND — ${hiddenXAccounts.length} HANDLES IDENTIFIED`, 'success', 1800],
      ];

      // Add each handle discovery line
      hiddenXAccounts.forEach((node, i) => {
        const handle = (node.label || node.fullId || node.id).replace(/^x_account:/, '').replace(/^@/, '');
        lines.push([`  └─ @${handle} ... MAPPED ✓`, 'highlight', 2000 + i * 300]);
      });
      lines.push(['COMMUNITY MAPPING COMPLETE', 'success', 2000 + hiddenXAccounts.length * 300 + 400]);

      for (const [text, type, delay] of lines) {
        setTimeout(() => addTerminalLine(text, type), delay);
      }

      const totalDelay = 2000 + hiddenXAccounts.length * 300 + 800;
      setTimeout(() => {
        setXAccountsRevealed(true);
        setRevealingXAccounts(false);
        setTimeout(() => setTerminalVisible(false), 2000);
        toast.success(`🐦 ${hiddenXAccounts.length} X Community handles mapped!`);
      }, totalDelay);
      return;
    }

    // Otherwise do the real API call
    setCommunitySearching(true);
    toast.info('🐦 Searching for X Community...');
    try {
      const walletNode = graphData.nodes.find(n => n.type === 'wallet');
      const wallet = walletNode?.fullId || walletNode?.id.replace(/^wallet:/, '');
      await autoDiscoverCommunity(tokenMint, wallet);
      setTimeout(() => refetch(), 1500);
      toast.success('🐦 X Community discovery complete — refreshing graph');
    } catch (err) {
      toast.error('X Community discovery failed');
    } finally {
      setCommunitySearching(false);
    }
  }, [graphData.nodes, searchInput, autoDiscoverCommunity, refetch, xAccountsRevealed, addTerminalLine, clearTerminal]);

  // --- KYC search with hacker terminal showmanship ---
  const handleFindKYC = useCallback(async () => {
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    const targetWallet = focusedEntity?.type === 'wallet' 
      ? focusedEntity.id.replace(/^wallet:/, '') 
      : walletNodes[0]?.id.split(':').slice(1).join(':');
    if (!targetWallet) { toast.error('No wallet found to trace KYC root'); return; }
    
    setKycSearching(true);
    setTerminalTitle('KYC GENEALOGY TRACER');
    setTerminalVisible(true);
    clearTerminal();

    // Start terminal output
    addTerminalLine('INITIALIZING WALLET GENEALOGY TRACER v2.1', 'info');
    setTimeout(() => addTerminalLine(`TARGET WALLET: ${targetWallet.slice(0, 20)}...`, 'info'), 300);
    setTimeout(() => addTerminalLine('QUERYING FUNDING CHAIN...', 'info'), 700);
    setTimeout(() => addTerminalLine('DEPTH 0 ── SCANNING INCOMING SOL TRANSFERS', 'info'), 1100);

    try {
      const { data, error } = await supabase.functions.invoke('mesh-kyc-deep-search', {
        body: { walletAddress: targetWallet, maxDepth: 5 },
      });
      if (error) throw error;

      // Animate the chain discovery
      if (data?.chain && data.chain.length > 0) {
        data.chain.forEach((link: any, i: number) => {
          setTimeout(() => {
            const wallet = link.wallet?.slice(0, 16) || '???';
            const funder = link.funder?.slice(0, 16) || '???';
            addTerminalLine(`DEPTH ${i + 1} ── ${wallet}... ← funded by ${funder}...`, 'info');
          }, 1500 + i * 600);
        });
      }

      const chainDelay = 1500 + (data?.chain?.length || 0) * 600;

      if (data?.kycRoot) {
        const isCexConfirmed = data.kycConfirmed !== false; // backwards compat: if field missing, assume true
        const rootLabel = isCexConfirmed 
          ? `🏦 CEX ROOT IDENTIFIED: ${data.kycRoot.slice(0, 24)}...`
          : `🔍 DEEPEST FUNDER: ${data.kycRoot.slice(0, 24)}... (trail cold)`;
        
        setTimeout(() => {
          addTerminalLine('', 'info');
          addTerminalLine('█████████████████████████████████████████', 'highlight');
          addTerminalLine(`  ${rootLabel}`, 'highlight');
          addTerminalLine(`  CHAIN DEPTH: ${data.chainDepth || data.chain?.length || 0} HOPS`, 'success');
          addTerminalLine(`  WALLETS TRACED: ${data.walletsTraced || 0}`, 'success');
          if (!isCexConfirmed) {
            addTerminalLine('  ⚠ NO CEX CONFIRMED — TRAIL WENT COLD', 'warning');
          }
          addTerminalLine('█████████████████████████████████████████', 'highlight');
        }, chainDelay + 400);

        setTimeout(() => {
          // Auto-focus on KYC bubble
          expandEntity(`kyc_root:${data.kycRoot}`);
          expandEntity(`wallet:${targetWallet}`);
          if (data.chain) {
            for (const link of data.chain) {
              if (link.wallet) expandEntity(`wallet:${link.wallet}`);
              if (link.funder) expandEntity(`wallet:${link.funder}`);
            }
          }
          setTimeout(() => {
            refetch();
            // Center on root node after graph updates
            setTimeout(() => {
              if (graphRef.current) {
                const kycNode = graphRef.current.graphData().nodes.find(
                  (n: any) => n.id === `kyc_root:${data.kycRoot}` || n.id.includes(data.kycRoot)
                );
                if (kycNode) {
                  graphRef.current.centerAt(kycNode.x, kycNode.y, 1200);
                  graphRef.current.zoom(2.5, 1200);
                }
              }
            }, 800);
          }, 500);

          setKycFound(true);
          const toastMsg = isCexConfirmed 
            ? `🏦 CEX Root found in ${data.chainDepth || data.chain?.length || 0} hops: ${data.kycRoot.slice(0, 12)}...`
            : `🔍 Deepest funder found (trail cold) in ${data.chainDepth || data.chain?.length || 0} hops: ${data.kycRoot.slice(0, 12)}...`;
          toast.success(toastMsg);
          setTimeout(() => setTerminalVisible(false), 3000);
        }, chainDelay + 1200);
      } else {
        setTimeout(() => {
          addTerminalLine(`NO FUNDING CHAIN FOUND — ${data?.walletsTraced || 0} WALLETS TRACED`, 'warning');
          addTerminalLine('TRAIL EXHAUSTED. NO CEX OR FUNDER DISCOVERED.', 'warning');
          toast.warning(`No funding chain found after tracing ${data?.walletsTraced || 0} wallets`);
          setTimeout(() => setTerminalVisible(false), 2500);
        }, chainDelay + 400);
      }
    } catch (err: any) {
      addTerminalLine(`ERROR: ${err.message}`, 'error');
      addTerminalLine('TRACE ABORTED', 'error');
      toast.error(`KYC search failed: ${err.message}`);
      setTimeout(() => setTerminalVisible(false), 2000);
    } finally {
      setKycSearching(false);
    }
  }, [graphData.nodes, focusedEntity, refetch, expandEntity, addTerminalLine, clearTerminal]);

  const handleFindTokens = useCallback(async () => {
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    if (walletNodes.length === 0 && !focusedEntity) { toast.error('No wallet nodes to scan'); return; }
    setTokenSearching(true);
    const walletsToScan = focusedEntity?.type === 'wallet'
      ? [focusedEntity.id.replace(/^wallet:/, '')]
      : walletNodes.slice(0, 5).map(n => n.id.split(':').slice(1).join(':'));
    let totalTokens = 0;
    for (const wallet of walletsToScan) {
      try {
        const { data, error } = await supabase.functions.invoke('mesh-wallet-token-discovery', {
          body: { walletAddress: wallet },
        });
        if (error) throw error;
        totalTokens += data?.tokensFound || 0;
      } catch (err: any) {
        toast.error(`Token scan failed: ${err.message}`);
      }
    }
    if (totalTokens > 0) toast.success(`🎯 ${totalTokens} tokens discovered`);
    else toast.warning('No tokens found');
    setTimeout(() => refetch(), 1000);
    setTokenSearching(false);
  }, [graphData.nodes, focusedEntity, refetch]);

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickNodeRef = useRef<string | null>(null);

  const handleNodeClick = useCallback((node: any) => {
    const nodeId = node.id as string;
    if (lastClickNodeRef.current === nodeId && clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      lastClickNodeRef.current = null;
      const parts = nodeId.split(':');
      const type = parts[0];
      const rawId = parts.slice(1).join(':');
      setSearchInput(rawId);
      focusOnEntity(rawId, type);
      if (type === 'wallet' || type === 'token') triggerSpider(rawId, 'quick');
      return;
    }
    lastClickNodeRef.current = nodeId;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      lastClickNodeRef.current = null;
      expandEntity(nodeId);
      if (graphRef.current) {
        graphRef.current.centerAt(node.x, node.y, 800);
        graphRef.current.zoom(2, 800);
      }
    }, 300);
  }, [expandEntity, triggerSpider, focusOnEntity]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const meshNode = node as MeshNode & { x: number; y: number };
    const color = ENTITY_COLORS[meshNode.type] || '#888';
    const size = Math.max(4, Math.min(meshNode.val * 3 + 3, 20));
    const isFocused = focusedEntity && meshNode.id.includes(focusedEntity.id);
    if (isFocused) { ctx.shadowColor = color; ctx.shadowBlur = 15; }
    if (meshNode.type === 'token') {
      // Thick white border ring for the searched token in Solar Min
      const isSearchedToken = focusedEntity && meshNode.id.includes(focusedEntity.id);
      const ringSize = isSearchedToken && solarMode === 'minimum' ? size + 4 : size + 2;
      const ringWidth = isSearchedToken && solarMode === 'minimum' ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(meshNode.x, meshNode.y, ringSize, 0, 2 * Math.PI);
      ctx.strokeStyle = isSearchedToken && solarMode === 'minimum' ? '#fff' : color;
      ctx.lineWidth = ringWidth;
      ctx.globalAlpha = isSearchedToken && solarMode === 'minimum' ? 0.9 : 0.4;
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    ctx.arc(meshNode.x, meshNode.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    // Connected nodes get a visible white ring; focused nodes get thick bright ring
    const isConnected = meshNode.val >= 2;
    ctx.strokeStyle = isFocused ? '#fff' : isConnected ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth = isFocused ? 2.5 : isConnected ? 1.5 : 0.5; ctx.stroke(); ctx.shadowBlur = 0;
    if (meshNode.type === 'kyc_root') {
      ctx.fillStyle = '#fff'; ctx.font = `${Math.max(8, 12 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🏦', meshNode.x, meshNode.y);
    }
    // Admin crown or mod shield on x_account nodes
    if (meshNode.type === 'x_account' && meshNode.role === 'admin') {
      ctx.font = `${Math.max(6, 10 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('👑', meshNode.x, meshNode.y - size - 1);
    } else if (meshNode.type === 'x_account' && meshNode.role === 'mod') {
      ctx.font = `${Math.max(6, 10 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('🛡️', meshNode.x, meshNode.y - size - 1);
    }
    // Determine label text - use "Dev Wallet" for dev wallets
    let labelText = meshNode.label;
    if (meshNode.isDev && meshNode.type === 'wallet') {
      labelText = '📡 Dev Wallet';
    }
    if (labelText) {
      const labelFontSize = Math.max(6, 9 / globalScale);
      ctx.font = `bold ${labelFontSize}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      // Blue label for admin/mod x_account nodes
      const labelColor = (meshNode.type === 'x_account' && (meshNode.role === 'admin' || meshNode.role === 'mod'))
        ? '#60a5fa' : 'rgba(255,255,255,0.9)';
      ctx.fillStyle = labelColor; ctx.fillText(labelText, meshNode.x, meshNode.y + size + 3);
    }
  }, [focusedEntity, solarMode]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = link.source; const tgt = link.target;
    if (!src.x || !tgt.x) return;
    const rel = link.relationship || '';
    let strokeColor = 'rgba(255,255,255,0.2)';
    let lineWidth = 1;
    // Created links (token↔dev wallet) — visible but not overwhelming
    if (rel.includes('created')) { strokeColor = 'rgba(234,179,8,0.5)'; lineWidth = 1.5; }
    else if (rel.includes('funded')) { strokeColor = 'rgba(34,197,94,0.45)'; lineWidth = 1.5; }
    else if (rel.includes('kyc')) { strokeColor = 'rgba(255,255,255,0.4)'; lineWidth = 1.5; }
    else if (rel.includes('operates') || rel.includes('admin') || rel.includes('mod')) { strokeColor = 'rgba(96,165,250,0.4)'; lineWidth = 1; }
    else if (rel.includes('community_for') || rel.includes('social_account')) { strokeColor = 'rgba(99,102,241,0.35)'; lineWidth = 1; }
    ctx.beginPath(); ctx.moveTo(src.x, src.y); ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = strokeColor; ctx.lineWidth = lineWidth; ctx.stroke();
    if (globalScale > 2) {
      const midX = (src.x + tgt.x) / 2; const midY = (src.y + tgt.y) / 2;
      ctx.font = `${Math.max(5, 7 / globalScale)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(rel, midX, midY);
    }
  }, []);

  // --- SHOWMANSHIP: Filter x_account nodes until revealed ---
  const filteredDisplayData = useMemo(() => {
    const isOverCap = !capBroken && graphData.nodes.length > nodeCap;
    let baseNodes = isOverCap ? graphData.nodes.slice(0, nodeCap) : graphData.nodes;
    
    // Hide x_account nodes until user clicks Map X Community
    if (!xAccountsRevealed) {
      baseNodes = baseNodes.filter(n => n.type !== 'x_account');
    }

    // Solar Minimum: BFS from token node, only immediate ecosystem + max 4 wallet hops
    if (solarMode === 'minimum' && baseNodes.length > 0) {
      const tokenNode = baseNodes.find(n => n.type === 'token');
      if (tokenNode) {
        const allowedIds = new Set<string>();
        const walletHops = new Map<string, number>(); // track wallet hop depth
        const queue: Array<{ id: string; walletDepth: number }> = [{ id: tokenNode.id, walletDepth: 0 }];
        allowedIds.add(tokenNode.id);

        // Build adjacency from ALL graph links (not just filtered)
        const adj = new Map<string, Array<{ neighbor: string; rel: string }>>();
        for (const link of graphData.links) {
          const srcId = typeof link.source === 'string' ? link.source : (link.source as any).id;
          const tgtId = typeof link.target === 'string' ? link.target : (link.target as any).id;
          const rel = (link as any).relationship || '';
          if (!adj.has(srcId)) adj.set(srcId, []);
          if (!adj.has(tgtId)) adj.set(tgtId, []);
          adj.get(srcId)!.push({ neighbor: tgtId, rel });
          adj.get(tgtId)!.push({ neighbor: srcId, rel });
        }

        while (queue.length > 0) {
          const { id, walletDepth } = queue.shift()!;
          const currentNode = baseNodes.find(n => n.id === id);
          const currentType = currentNode?.type || '';
          const neighbors = adj.get(id) || [];
          for (const { neighbor, rel } of neighbors) {
            if (allowedIds.has(neighbor)) continue;
            const neighborNode = baseNodes.find(n => n.id === neighbor);
            if (!neighborNode) continue;

            const nType = neighborNode.type;

            // Social nodes (website, x_community, x_account) should only attach to TOKEN nodes
            // not directly to wallets — this prevents the dev wallet from stealing social links
            if (['website', 'x_community', 'x_account'].includes(nType)) {
              if (currentType === 'token' || currentType === 'x_community') {
                allowedIds.add(neighbor);
                queue.push({ id: neighbor, walletDepth });
              }
              continue;
            }

            // KYC root: always allow
            if (nType === 'kyc_root') {
              allowedIds.add(neighbor);
              queue.push({ id: neighbor, walletDepth });
              continue;
            }

            // Wallet nodes: allow if within 4 hops from dev wallet
            if (nType === 'wallet') {
              const newDepth = walletDepth + 1;
              if (newDepth <= 4) {
                allowedIds.add(neighbor);
                walletHops.set(neighbor, newDepth);
                queue.push({ id: neighbor, walletDepth: newDepth });
              }
              continue;
            }

            // Token: only the searched token (already added)
            // Skip other tokens in minimum mode
          }
        }

        baseNodes = baseNodes.filter(n => allowedIds.has(n.id));
      }
    }

    const nodeIds = new Set(baseNodes.map(n => n.id));
    const baseLinks = graphData.links.filter(l =>
      nodeIds.has(typeof l.source === 'string' ? l.source : (l.source as any).id) &&
      nodeIds.has(typeof l.target === 'string' ? l.target : (l.target as any).id)
    );

    return { nodes: baseNodes, links: baseLinks };
  }, [graphData, nodeCap, capBroken, xAccountsRevealed, solarMode]);

  const displayData = filteredDisplayData;
  const isOverCap = !capBroken && graphData.nodes.length > nodeCap;


  const typeCounts = displayData.nodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const focusedDisplayInfo = (() => {
    if (!focusedEntity) return null;
    const matchingNode = graphData.nodes.find(n => n.id.includes(focusedEntity.id));
    const type = focusedEntity.type || matchingNode?.type || 'wallet';
    const emoji = type === 'token' ? '🪙' : type === 'wallet' ? '💰' : type === 'x_account' ? '🐦' : type === 'kyc_root' ? '🏦' : type === 'telegram' ? '📡' : '🔍';
    const label = matchingNode?.label || focusedEntity.id.slice(0, 16) + '...';
    return { emoji, label, type };
  })();

  const trafficLightColor = (tl?: string) => {
    switch (tl) {
      case 'RED': return 'text-red-400';
      case 'YELLOW': return 'text-yellow-400';
      case 'GREEN': return 'text-green-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-4">
      {/* Rate Limit Banner */}
      {isLimited && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {remaining > 0
                  ? `${remaining} of ${limit} free lookups remaining today`
                  : "Daily limit reached!"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!isAuthenticated && (
                <Button size="sm" variant="outline" onClick={() => navigate('/auth')} className="text-xs h-7">
                  Sign Up Free
                </Button>
              )}
              <Button size="sm" onClick={() => navigate('/subscriptions')} className="text-xs h-7 gap-1">
                <Crown className="h-3 w-3" />
                Subscribe for Unlimited
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            🎯 2 lookups a day per IP — check a Dev Wallet and a Token anytime! Subscribe for $9.99/mo for unlimited Bubble Map access.
          </p>
        </div>
      )}

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                🫧 Mesh Bubble Map
                {focusedDisplayInfo && (
                  <span className="text-base font-semibold" style={{ color: ENTITY_COLORS[focusedDisplayInfo.type] || 'hsl(var(--primary))' }}>
                    — {focusedDisplayInfo.emoji} {focusedDisplayInfo.label}
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Interactive visualization of the reputation mesh. Enter any entity to explore.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Paste wallet, token mint, or @handle..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 font-mono text-xs"
              disabled={!canSearch}
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={isLoading || !canSearch}>
              <Search className="h-3.5 w-3.5 mr-1" /> Trace
            </Button>
            <Button variant="ghost" size="sm" onClick={resetView}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Action buttons moved to unified control bar below */}

          {/* Action buttons moved to overlay inside graph canvas */}

          {/* Type Filters */}
          <div className="flex flex-wrap gap-1">
            {Object.entries(ENTITY_LABELS).map(([type, label]) => (
              <Badge key={type} variant={typeFilters.has(type) ? "default" : "outline"}
                className="cursor-pointer text-[10px] px-1.5 py-0 transition-all"
                style={{
                  backgroundColor: typeFilters.has(type) ? ENTITY_COLORS[type] + '33' : 'transparent',
                  borderColor: ENTITY_COLORS[type],
                  color: typeFilters.has(type) ? ENTITY_COLORS[type] : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => toggleTypeFilter(type)}>
                {label}{typeCounts[type] ? ` (${typeCounts[type]})` : ''}
              </Badge>
            ))}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>{displayData.nodes.length} entities</span>
            <span>{displayData.links.length} connections</span>
            {focusedDisplayInfo && (
              <span className="font-medium" style={{ color: ENTITY_COLORS[focusedDisplayInfo.type] || 'hsl(var(--primary))' }}>
                {focusedDisplayInfo.emoji} {focusedDisplayInfo.label}
              </span>
            )}
            {isOverCap && (
              <div className="flex items-center gap-1">
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                  CAP: {nodeCap}/{graphData.nodes.length}
                </Badge>
                <Button variant="outline" size="sm"
                  className="h-5 text-[10px] px-2 border-amber-500/50 text-amber-400"
                  onClick={() => { setCapBroken(true); toast.info(`Showing all ${graphData.nodes.length} nodes`); }}>
                  <Unlock className="h-2.5 w-2.5 mr-1" /> Break Cap
                </Button>
              </div>
            )}
          </div>

          {/* Spider Status */}
          {spiderStatus.active && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Radar className="h-3.5 w-3.5 text-primary animate-spin" />
                <span className="text-xs font-medium text-primary">{spiderStatus.stage}</span>
              </div>
              {mode !== 'promo' && spiderStatus.diagnostics && spiderStatus.diagnostics.length > 0 && (
                <button onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                  {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Diagnostics ({spiderStatus.diagnostics.length})
                </button>
              )}
              {mode !== 'promo' && showDiagnostics && spiderStatus.diagnostics && (
                <div className="rounded bg-background/50 p-2 space-y-0.5 text-[10px] font-mono text-muted-foreground">
                  {spiderStatus.diagnostics.map((d, i) => <div key={i}>{d}</div>)}
                </div>
              )}
            </div>
          )}

          {spiderStatus.error && displayData.nodes.length === 0 && (
            <div className="rounded-lg border border-muted/30 bg-muted/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {mode === 'promo'
                    ? "This entity hasn't been fully indexed yet. Try a different wallet or token, or click Retry to scan again."
                    : spiderStatus.error}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSpider} className="text-[10px] h-6">
                <Radar className="h-3 w-3 mr-1" /> Retry
              </Button>
            </div>
          )}
          {spiderStatus.error && displayData.nodes.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Network className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs text-primary">
                  ✅ First-level sweep complete — {displayData.nodes.length} entities mapped. Some external sources were unavailable but we found what we needed.
                </span>
              </div>
              {/* X Community triumphant reveal after discovery */}
              {xAccountsRevealed && (() => {
                const communityNodes = displayData.nodes.filter(n => n.type === 'x_community');
                const xAccountNodes = displayData.nodes.filter(n => n.type === 'x_account');
                if (communityNodes.length > 0 || xAccountNodes.length > 0) {
                  return (
                    <TooltipProvider>
                    <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-2 space-y-1.5 animate-fade-in">
                      <div className="flex items-center gap-2">
                        <img src={xIcon} alt="X" className="h-4 w-4 rounded-sm" />
                        <span className="text-cyan-400 text-xs font-semibold">X Community Mapped!</span>
                      </div>
                      {communityNodes.map(c => (
                        <div key={c.id} className="text-[11px] text-cyan-300">
                          📡 {c.label || c.fullId || c.id}
                        </div>
                      ))}
                      {xAccountNodes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          {xAccountNodes.map(a => {
                            const handle = (a.label || a.fullId || a.id).replace(/^@/, '').replace(/^x_account:/, '');
                            const isAdmin = a.role === 'admin';
                            const isMod = a.role === 'mod';
                            const hasRotatedHandle = a.redFlags?.some(f => f.type === 'rotated_handle');
                            const rotatedFlag = a.redFlags?.find(f => f.type === 'rotated_handle');
                            return (
                              <span key={a.id} className="inline-flex items-center gap-0.5">
                                {isAdmin && <span title="Admin">👑</span>}
                                {isMod && <span title="Moderator">🛡️</span>}
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a
                                      href={`https://x.com/${handle}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`font-medium hover:underline ${isAdmin || isMod ? 'text-blue-400' : 'text-cyan-300'}`}
                                    >
                                      @{handle}{(isAdmin || isMod) && <span className="ml-0.5 text-blue-400">✓</span>}
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    {a.displayName ? (
                                      <div><span className="font-semibold">{a.displayName}</span> · @{handle} · {isAdmin ? 'ADMIN' : isMod ? 'MOD' : 'Member'}</div>
                                    ) : (
                                      <div>@{handle} · {isAdmin ? 'ADMIN' : isMod ? 'MOD' : 'Member'}</div>
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                                {hasRotatedHandle && rotatedFlag && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="cursor-help text-amber-400 flex items-center gap-0.5">
                                        <SearchCheck className="h-3 w-3" />
                                        <span className="text-[9px]">⚠</span>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs bg-background border border-red-500/30">
                                      <div className="space-y-1">
                                        <div className="font-semibold text-red-400 flex items-center gap-1">
                                          🚩 Handle Recycling Detected
                                        </div>
                                        <div className="text-muted-foreground">{rotatedFlag.explanation}</div>
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    </TooltipProvider>
                  );
                }
                return null;
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dev Wallet Bar — auto-filled above graph */}
      {devWalletAddress && (
        <div className="rounded-lg border border-primary/20 bg-card/80 backdrop-blur px-4 py-2 flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400">●</span>
            <span>📡 Dev Wallet</span>
            <span className="font-semibold text-foreground">{devWalletAddress.slice(0, 6)}...{devWalletAddress.slice(-4)}</span>
          </div>
          <code className="font-mono text-[10px] text-muted-foreground select-all flex-1 truncate">{devWalletAddress}</code>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
            onClick={() => {
              navigator.clipboard.writeText(devWalletAddress);
              setCopiedDevWallet(true);
              toast.success('Dev wallet copied!');
              setTimeout(() => setCopiedDevWallet(false), 2000);
            }}>
            {copiedDevWallet ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </Button>
          <Badge variant="secondary" className="text-[10px]">
            {displayData.links.filter(l => {
              const srcId = typeof l.source === 'string' ? l.source : (l.source as any).id;
              const tgtId = typeof l.target === 'string' ? l.target : (l.target as any).id;
              return srcId?.includes(devWalletAddress) || tgtId?.includes(devWalletAddress);
            }).length} conn
          </Badge>
        </div>
      )}
      {devWalletLoading && (
        <div className="rounded-lg border border-muted/20 bg-card/50 px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Resolving dev wallet...
        </div>
      )}

      {/* Unified Control Bar — layout controls only */}
      {graphData.nodes.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card/80 backdrop-blur">
          {/* Solar Mode */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <Button variant={solarMode === 'minimum' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => setSolarMode('minimum')}>
              <Sun className="h-3 w-3 mr-1" /> Solar Min
            </Button>
            <Button variant={solarMode === 'clusters' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => setSolarMode('clusters')}>
              <Orbit className="h-3 w-3 mr-1" /> Solar Clusters
            </Button>
          </div>
          {/* View Mode */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <Button variant={viewMode === 'bubble' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => setViewMode('bubble')}>
              <Network className="h-3 w-3 mr-1" /> Bubble
            </Button>
            <Button variant={viewMode === 'tree' ? 'secondary' : 'ghost'} size="sm" className="h-7 text-xs px-2" onClick={() => setViewMode('tree')}>
              <GitBranch className="h-3 w-3 mr-1" /> Tree
            </Button>
          </div>
          {/* Spacing */}
          <div className="flex items-center gap-0.5 bg-muted rounded-md p-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setSpreadFactor(f => Math.max(1, f - 1))} title="Reduce spacing">
              <Minus className="h-3 w-3" />
            </Button>
            <span className="text-[10px] text-muted-foreground w-8 text-center">{spreadFactor}x</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setSpreadFactor(f => Math.min(10, f + 1))} title="Increase spacing">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          {/* Shakey-Shake */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => {
              if (graphRef.current) {
                const gd = graphRef.current.graphData();
                // Strip all position/velocity data so the simulation starts fresh
                gd.nodes.forEach((node: any) => {
                  delete node.x;
                  delete node.y;
                  delete node.vx;
                  delete node.vy;
                  node.fx = undefined;
                  node.fy = undefined;
                });
                // New object reference forces react-force-graph to fully re-initialize
                graphRef.current.graphData({ nodes: [...gd.nodes], links: [...gd.links] });
                // Auto-fit after the simulation settles
                setTimeout(() => {
                  if (graphRef.current) {
                    graphRef.current.zoomToFit(800, 40);
                  }
                }, 2500);
              }
            }}
            title="Resets Bubble Layout"
          >
            🫨 Shakey-Shake!
          </Button>
        </div>
      )}

      {/* Graph Canvas */}
      <Card className="overflow-hidden">
        <div ref={containerRef} className="w-full relative" style={{ height: '600px', background: 'hsl(var(--background))' }}>
          {/* Hacker Terminal Overlay */}
          <HackerTerminal lines={terminalLines} visible={terminalVisible} title={terminalTitle} />
          {/* Action Buttons Overlay — top-left inside graph */}
          {graphData.nodes.length > 0 && (
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
              <Button variant="outline" size="sm" onClick={handleFindKYC} disabled={kycSearching || kycFound}
                className={`text-xs h-7 justify-start backdrop-blur bg-background/70 ${kycFound
                  ? 'border-muted/30 text-muted-foreground opacity-50 cursor-not-allowed'
                  : 'border-amber-500/30 hover:bg-amber-500/10 text-amber-400'}`}>
                {kycSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Key className="h-3 w-3 mr-1" />}
                {kycFound ? 'KYC Root Found ✓' : 'Find KYC Root'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleFindTokens} disabled={tokenSearching}
                className="text-xs h-7 justify-start backdrop-blur bg-background/70 border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-400">
                {tokenSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Coins className="h-3 w-3 mr-1" />}
                Find All Tokens
              </Button>
              <Button variant="outline" size="sm" onClick={handleSpider} disabled={spiderStatus.active}
                className="text-xs h-7 justify-start backdrop-blur bg-background/70">
                <Radar className="h-3 w-3 mr-1" /> Deep Spider
              </Button>
              <Button variant="outline" size="sm" onClick={handleDiscoverCommunity} disabled={communitySearching || revealingXAccounts}
                className={`text-xs h-7 justify-start backdrop-blur bg-background/70 border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400 ${
                  hasSpideredOnce && !communitySearching && !xAccountsRevealed ? 'animate-[pulse_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite] border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.3)]' : ''
                }`}>
                {communitySearching || revealingXAccounts ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : (
                  <img src={xIcon} alt="X" className="h-3 w-3 mr-1 rounded-sm" />
                )}
                Map X Community
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Loading mesh graph...</p>
              </div>
            </div>
          ) : !canSearch && displayData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md px-6">
                <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
                <h3 className="text-lg font-semibold text-foreground">Daily Limit Reached</h3>
                <p className="text-sm text-muted-foreground">
                  Subscribe for $9.99/mo to unlock unlimited Bubble Map access with full spidering, KYC tracing, and enrichment.
                </p>
                <Button onClick={() => navigate('/subscriptions')} className="gap-2">
                  <Crown className="h-4 w-4" /> Upgrade Now
                </Button>
              </div>
            </div>
          ) : !focusedEntity && displayData.nodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md px-6">
                <p className="text-4xl">🫧</p>
                <h3 className="text-lg font-semibold text-foreground">Enter an entity to explore</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Paste a <span className="font-medium" style={{ color: ENTITY_COLORS.wallet }}>wallet address</span>,{' '}
                  <span className="font-medium" style={{ color: ENTITY_COLORS.token }}>token mint</span>, or{' '}
                  <span className="font-medium" style={{ color: ENTITY_COLORS.x_account }}>@handle</span> above.
                </p>
                <p className="text-xs text-muted-foreground">
                  The Oracle Spider will automatically discover the full network — wallets, tokens, socials, and KYC chains.
                </p>
                <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                  {Object.entries({ wallet: 'Wallets', token: 'Tokens', x_account: 'X Accounts', telegram: 'Telegram', kyc_root: 'KYC Root' }).map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: ENTITY_COLORS[k], border: k === 'kyc_root' ? '1px solid hsl(var(--border))' : 'none' }} />
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : shouldOfferSpider ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md px-6">
                <Radar className="h-8 w-8 text-primary animate-spin mx-auto" />
                <h3 className="text-lg font-semibold text-foreground">Auto-spidering entity...</h3>
                <p className="text-sm text-muted-foreground">
                  Resolving dev wallet, funding chain, tokens, and socials for{' '}
                  <span className="font-mono text-xs text-primary">{focusedEntity?.id.slice(0, 16)}...</span>
                </p>
              </div>
            </div>
          ) : focusedEntity && displayData.nodes.length === 0 && hasSpideredOnce ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-md px-6">
                <p className="text-4xl">🔍</p>
                <h3 className="text-lg font-semibold text-foreground">No mesh data found</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {spiderHasError ? spiderStatus.error : 'The spider completed but found no connections for this entity.'}
                </p>
                {spiderStatus.diagnostics && spiderStatus.diagnostics.length > 0 && (
                  <div className="text-left bg-muted/30 rounded-lg p-3 text-xs space-y-1 font-mono">
                    {spiderStatus.diagnostics.map((d, i) => (
                      <div key={i} className="text-muted-foreground">{d}</div>
                    ))}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setHasSpideredOnce(false);
                    clearCooldown(searchInput.trim());
                    triggerSpider(searchInput.trim(), 'deep');
                    setHasSpideredOnce(true);
                  }}
                >
                  <Radar className="h-4 w-4 mr-2" /> Retry Spider
                </Button>
              </div>
            </div>
          ) : (
            <ForceGraph2D
              ref={graphRef}
              graphData={displayData}
              width={dimensions.width}
              height={600}
              backgroundColor="transparent"
              nodeCanvasObject={paintNode}
              linkCanvasObject={paintLink}
              onNodeClick={handleNodeClick}
              onNodeHover={(node: any) => setHoveredNode(node as MeshNode | null)}
              nodeLabel={(node: any) => {
                const n = node as MeshNode;
                const rawId = n.fullId || n.id.split(':').slice(1).join(':');
                const devLabel = n.isDev ? '📡 Dev Wallet\n' : '';
                const nameLabel = n.displayName ? `${n.displayName}\n` : '';
                return `${devLabel}${nameLabel}${ENTITY_LABELS[n.type] || n.type}\n${rawId}\n${Math.round(n.val)} connections`;
              }}
              cooldownTicks={isMobile ? 40 : 80}
              d3AlphaDecay={isMobile ? 0.05 : 0.03}
              d3VelocityDecay={viewMode === 'tree' ? 0.45 : 0.4}
              d3AlphaMin={isMobile ? 0.01 : 0.005}
              dagMode={viewMode === 'tree' ? 'td' : undefined}
              dagLevelDistance={viewMode === 'tree' ? 80 : undefined}
              linkDirectionalParticles={isMobile ? 0 : 1}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleSpeed={0.005}
              linkDirectionalParticleColor={isMobile ? undefined : (link: any) => {
                const rel = link.relationship || '';
                if (rel.includes('funded')) return 'rgba(34,197,94,0.7)';
                if (rel.includes('created')) return 'rgba(234,179,8,0.7)';
                return 'rgba(255,255,255,0.4)';
              }}
              linkDirectionalArrowLength={(link: any) => {
                const rel = link.relationship || '';
                if (['funded_by', 'directly_funded', 'created', 'created_by'].includes(rel)) return 5;
                return 0;
              }}
              linkDirectionalArrowRelPos={0.7}
              enableZoomInteraction={true}
              enablePanInteraction={true}
              nodeRelSize={5}
            />
          )}
        </div>
      </Card>

      {/* Hovered Node Info */}
      {hoveredNode && (
        <Card className="border-primary/30">
          <CardContent className="py-2 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: ENTITY_COLORS[hoveredNode.type] }} />
              <span className="font-medium">
                {hoveredNode.isDev ? '📡 Dev Wallet' : (ENTITY_LABELS[hoveredNode.type] || hoveredNode.type)}
              </span>
              <span className="font-semibold">{hoveredNode.displayName || hoveredNode.label}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">{Math.round(hoveredNode.val)} conn</Badge>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground select-all break-all pl-5">
              {hoveredNode.fullId || hoveredNode.id.split(':').slice(1).join(':')}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Social Timeline — also show for hovered token nodes */}
      {(hoveredNode?.type === 'token' || focusedEntity?.type === 'token') && (
        <SocialTimeline tokenMint={
          (hoveredNode?.type === 'token' ? (hoveredNode.fullId || hoveredNode.id.split(':').slice(1).join(':')) : null) ||
          focusedEntity?.id.replace(/^token:/, '') || ''
        } />
      )}
    </div>
  );
};

export default PublicBubbleMap;
