import React, { useRef, useCallback, useState, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useMeshGraph, ENTITY_COLORS, ENTITY_LABELS, MeshNode, RedFlag } from "@/hooks/useMeshGraph";
import { useHeliusCreditTracker } from "@/hooks/useHeliusCreditTracker";
import { useApifyCreditTracker } from "@/hooks/useApifyCreditTracker";
import { useBubbleMapHoldings } from "@/hooks/useBubbleMapHoldings";
import { useCTODetection } from "@/hooks/useCTODetection";
import { Search, RotateCcw, Radar, AlertTriangle, ChevronDown, ChevronUp, Network, GitBranch, Key, Coins, Loader2, Users, Zap, Gauge, Unlock, PieChart, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ViewMode = 'bubble' | 'tree';

const NODE_CAP_DEFAULT = 80;

const MeshGraphVisualizer = () => {
  const graphRef = useRef<any>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [hoveredNode, setHoveredNode] = useState<MeshNode | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('bubble');
  const [kycSearching, setKycSearching] = useState(false);
  const [tokenSearching, setTokenSearching] = useState(false);
  const [communitySearching, setCommunitySearching] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [nodeCap, setNodeCap] = useState(NODE_CAP_DEFAULT);
  const [capBroken, setCapBroken] = useState(false);
  const [redFlagDialog, setRedFlagDialog] = useState<{ node: MeshNode; flags: RedFlag[] } | null>(null);
  const [ctoChecked, setCtoChecked] = useState<Set<string>>(new Set());

  const { snapshot: creditSnapshot, startTracking, stopTracking, resetTracking } = useHeliusCreditTracker();
  const { snapshot: apifySnapshot, startTracking: startApifyTracking, stopTracking: stopApifyTracking, resetTracking: resetApifyTracking } = useApifyCreditTracker();
  const holdings = useBubbleMapHoldings();
  const { detectCTO, buildCTORedFlag } = useCTODetection();

  const {
    graphData,
    isLoading,
    focusedEntity,
    focusOnEntity,
    expandEntity,
    resetView,
    typeFilters,
    toggleTypeFilter,
    spiderStatus,
    triggerSpider,
    refetch,
  } = useMeshGraph();

  // Resize observer for responsive canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, 500),
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Track previous viewMode to only reheat on mode change
  const prevViewModeRef = useRef<ViewMode>(viewMode);

  // Adjust forces based on view mode
  useEffect(() => {
    if (graphRef.current) {
      // Use per-link distance: admin/mod handles stay tight around their X Community
      const linkForce = graphRef.current.d3Force('link');
      if (linkForce) {
        linkForce.distance((link: any) => {
          const rel = link.relationship || '';
          const srcType = link.source?.type || '';
          const tgtType = link.target?.type || '';
          const involvesKyc = srcType === 'kyc_root' || tgtType === 'kyc_root';
          const involvesWebsite = srcType === 'website' || tgtType === 'website';
          const involvesCommunity = srcType === 'x_community' || tgtType === 'x_community';
          
          // Push important nodes (KYC, Website, X Community) to outer edge with longer links
          if (involvesKyc) {
            return viewMode === 'tree' ? 120 : 100;
          }
          if (involvesWebsite) {
            return viewMode === 'tree' ? 110 : 90;
          }
          if (involvesCommunity) {
            return viewMode === 'tree' ? 100 : 80;
          }
          if (['admin_of', 'mod_of', 'co_mod'].includes(rel)) {
            return viewMode === 'tree' ? 50 : 40;
          }
          if (['community_for', 'social_account'].includes(rel)) {
            return viewMode === 'tree' ? 80 : 65;
          }
          return viewMode === 'tree' ? 90 : 70;
        });
      }
      graphRef.current.d3Force('charge')?.strength(viewMode === 'tree' ? -350 : -280);
      
      // Add boundary force to keep nodes on screen (softer in tree mode)
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
      
      // Only reheat simulation when viewMode actually changes, not on every graphData update
      if (prevViewModeRef.current !== viewMode) {
        prevViewModeRef.current = viewMode;
        graphRef.current.d3ReheatSimulation();
      }
    }
  }, [graphData, viewMode, dimensions.width]);

  const handleSearch = useCallback(() => {
    if (!searchInput.trim()) {
      resetView();
      stopTracking();
      return;
    }
    let type = 'wallet';
    let normalizedInput = searchInput.trim();
    if (normalizedInput.startsWith('@')) {
      type = 'x_account';
      // Normalize: strip @ and lowercase to match DB storage
      normalizedInput = normalizedInput.replace(/^@/, '').toLowerCase();
    } else if (normalizedInput.length < 20) {
      type = 'token';
    }
    focusOnEntity(normalizedInput, type);
    // Start credit tracking on new search
    resetTracking();
    startTracking();
    resetApifyTracking();
    startApifyTracking();
    // Reset node cap
    setNodeCap(NODE_CAP_DEFAULT);
    setCapBroken(false);
  }, [searchInput, focusOnEntity, resetView, startTracking, stopTracking, resetTracking, startApifyTracking, resetApifyTracking]);

  // Auto-spider: when focused entity returns 0 results
  const shouldOfferSpider = focusedEntity && !isLoading && graphData.nodes.length === 0 && !spiderStatus.active && !spiderStatus.error;

  useEffect(() => {
    if (shouldOfferSpider && searchInput.trim()) {
      triggerSpider(searchInput.trim(), 'deep');
    }
  }, [shouldOfferSpider, searchInput, triggerSpider]);

  const handleSpider = useCallback(() => {
    if (!searchInput.trim()) return;
    triggerSpider(searchInput.trim(), 'deep');
  }, [searchInput, triggerSpider]);

  // ═══ Find KYC Root ═══
  const handleFindKYC = useCallback(async () => {
    // Find wallet nodes in the graph to trace
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    const targetWallet = focusedEntity?.type === 'wallet' 
      ? focusedEntity.id.replace(/^wallet:/, '') 
      : walletNodes[0]?.id.split(':').slice(1).join(':');
    
    if (!targetWallet) {
      toast.error('No wallet found to trace KYC root');
      return;
    }

    setKycSearching(true);
    toast.info(`🔍 Deep KYC search for ${targetWallet.slice(0, 12)}...`);

    try {
      const { data, error } = await supabase.functions.invoke('mesh-kyc-deep-search', {
        body: { walletAddress: targetWallet, maxDepth: 5 },
      });

      if (error) throw error;

      if (data?.kycRoot) {
        toast.success(`🏦 KYC Root found: ${data.kycRoot.slice(0, 12)}... (${data.walletsTraced} wallets traced, ${data.meshLinksAdded} links added)`);
        
        // Auto-expand all discovered wallets so they appear in the graph
        if (data.kycRoot) expandEntity(`kyc_root:${data.kycRoot}`);
        expandEntity(`wallet:${targetWallet}`);
        if (data.chain) {
          for (const link of data.chain) {
            if (link.wallet) expandEntity(`wallet:${link.wallet}`);
            if (link.funder) expandEntity(`wallet:${link.funder}`);
          }
        }
      } else {
        toast.warning(`No KYC root found after tracing ${data?.walletsTraced || 0} wallets`);
      }

      // Refresh the graph after expanding
      setTimeout(() => refetch(), 500);
    } catch (err: any) {
      toast.error(`KYC search failed: ${err.message}`);
    } finally {
      setKycSearching(false);
    }
  }, [graphData.nodes, focusedEntity, refetch]);

  // ═══ Find All Tokens ═══
  const handleFindTokens = useCallback(async () => {
    const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
    if (walletNodes.length === 0 && !focusedEntity) {
      toast.error('No wallet nodes to scan for tokens');
      return;
    }

    setTokenSearching(true);
    // Extract raw wallet addresses — strip type prefix and skip non-wallet entities
    const walletsToScan = focusedEntity 
      ? (focusedEntity.type === 'wallet' 
          ? [focusedEntity.id.replace(/^wallet:/, '')]
          : (() => { toast.error('Focused entity is not a wallet — select a wallet node to scan tokens'); setTokenSearching(false); return []; })())
      : walletNodes.slice(0, 5).map(n => n.id.split(':').slice(1).join(':'));

    let totalTokens = 0;
    let totalLinks = 0;

    for (const wallet of walletsToScan) {
      toast.info(`🪙 Scanning ${wallet.slice(0, 12)}... for minted tokens`);
      try {
        const { data, error } = await supabase.functions.invoke('mesh-wallet-token-discovery', {
          body: { walletAddress: wallet },
        });

        if (error) throw error;
        totalTokens += data?.tokensFound || 0;
        totalLinks += data?.meshLinksAdded || 0;
        
        if (data?.tokensFound > 0) {
          toast.success(`Found ${data.tokensFound} tokens for ${wallet.slice(0, 8)}...`);
        }
      } catch (err: any) {
        toast.error(`Token scan failed for ${wallet.slice(0, 8)}: ${err.message}`);
      }
    }

    if (totalTokens > 0) {
      toast.success(`🎯 Total: ${totalTokens} tokens discovered, ${totalLinks} mesh links added`);
    } else {
      toast.warning('No tokens found for any scanned wallets');
    }

    setTimeout(() => refetch(), 1000);
    setTokenSearching(false);
  }, [graphData.nodes, focusedEntity, refetch]);

  // ═══ Enrich All Tokens — fetch $TICKER, socials, dev wallets from DexScreener ═══
  const handleEnrichAllTokens = useCallback(async () => {
    const tokenNodes = graphData.nodes.filter(n => n.type === 'token');
    if (tokenNodes.length === 0) {
      toast.error('No token nodes to enrich');
      return;
    }

    setEnriching(true);
    const mints = tokenNodes.map(n => n.fullId || n.id.split(':').slice(1).join(':'));
    let totalLinksAdded = 0;
    let totalTickersResolved = 0;

    toast.info(`⚡ Enriching ${mints.length} tokens from DexScreener...`);

    try {
      // Batch fetch from DexScreener (max 30 per call)
      for (let i = 0; i < mints.length; i += 30) {
        const batch = mints.slice(i, i + 30);
        const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${batch.join(',')}`);
        if (!res.ok) {
          console.warn(`[Enrich] DexScreener batch ${i / 30 + 1} failed: ${res.status}`);
          continue;
        }
        const pairs = await res.json();
        if (!Array.isArray(pairs)) continue;

        // Group by base token address (first pair per token)
        const tokenMap = new Map<string, any>();
        for (const pair of pairs) {
          const addr = pair.baseToken?.address;
          if (addr && !tokenMap.has(addr)) {
            tokenMap.set(addr, pair);
          }
        }

        // Process each discovered token
        for (const [mint, pair] of tokenMap.entries()) {
          const symbol = pair.baseToken?.symbol;
          if (symbol) totalTickersResolved++;

          const socials = pair.info?.socials || [];
          const websites = pair.info?.websites || [];

          // Extract and upsert social links
          const upserts: any[] = [];

          // X/Twitter handle
          const xUrl = socials.find((s: any) =>
            (s.url?.includes('x.com/') || s.url?.includes('twitter.com/')) &&
            !s.url?.includes('/communities/')
          )?.url;
          if (xUrl) {
            const match = xUrl.match(/(?:x\.com|twitter\.com)\/(@?([a-zA-Z0-9_]+))/i);
            if (match) {
              const handle = (match[2] || match[1]).replace(/^@/, '').toLowerCase();
              if (handle && !['i', 'intent', 'search', 'home', 'explore'].includes(handle)) {
                upserts.push({
                  source_type: 'token', source_id: mint,
                  linked_type: 'x_account', linked_id: handle,
                  relationship: 'social_account', confidence: 85,
                  discovered_via: 'dexscreener_enrich',
                  evidence: { symbol, source: 'dexscreener' },
                });
              }
            }
          }

          // X Community
          const communityUrl = socials.find((s: any) => s.url?.includes('/communities/'))?.url;
          if (communityUrl) {
            const communityMatch = communityUrl.match(/communities\/(\d+)/);
            if (communityMatch) {
              upserts.push({
                source_type: 'token', source_id: mint,
                linked_type: 'x_community', linked_id: communityMatch[1],
                relationship: 'community_for', confidence: 90,
                discovered_via: 'dexscreener_enrich',
                evidence: { symbol, communityUrl, source: 'dexscreener' },
              });
            }
          }

          // Telegram
          const telegramUrl = socials.find((s: any) => s.url?.includes('t.me/'))?.url;
          if (telegramUrl) {
            const tgMatch = telegramUrl.match(/t\.me\/([a-zA-Z0-9_]+)/);
            if (tgMatch) {
              upserts.push({
                source_type: 'token', source_id: mint,
                linked_type: 'telegram', linked_id: tgMatch[1],
                relationship: 'social_account', confidence: 80,
                discovered_via: 'dexscreener_enrich',
                evidence: { symbol, source: 'dexscreener' },
              });
            }
          }

          // Website
          const websiteUrl = websites?.[0]?.url || pair.info?.websites?.[0];
          if (websiteUrl && typeof websiteUrl === 'string') {
            upserts.push({
              source_type: 'token', source_id: mint,
              linked_type: 'website', linked_id: websiteUrl,
              relationship: 'website', confidence: 85,
              discovered_via: 'dexscreener_enrich',
              evidence: { symbol, source: 'dexscreener' },
            });
          }

          // Discord
          const discordUrl = socials.find((s: any) => s.url?.includes('discord'))?.url;
          if (discordUrl) {
            upserts.push({
              source_type: 'token', source_id: mint,
              linked_type: 'discord', linked_id: discordUrl,
              relationship: 'social_account', confidence: 80,
              discovered_via: 'dexscreener_enrich',
              evidence: { symbol, source: 'dexscreener' },
            });
          }

          // Batch upsert all discovered links
          if (upserts.length > 0) {
            const { error } = await supabase
              .from('reputation_mesh')
              .upsert(upserts, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
            if (!error) totalLinksAdded += upserts.length;
            else console.warn(`[Enrich] Upsert failed for ${mint.slice(0, 8)}:`, error);
          }
        }

        // Rate limit between batches
        if (i + 30 < mints.length) await new Promise(r => setTimeout(r, 300));
      }

      // Also trigger spider for dev wallet discovery on all token mints
      const walletNodes = graphData.nodes.filter(n => n.type === 'wallet');
      if (walletNodes.length > 0) {
        toast.info(`🔍 Also spidering ${Math.min(walletNodes.length, 3)} wallets for deeper mesh data...`);
        for (const wn of walletNodes.slice(0, 3)) {
          const walletId = wn.fullId || wn.id.split(':').slice(1).join(':');
          triggerSpider(walletId, 'quick');
          await new Promise(r => setTimeout(r, 500));
        }
      }

      toast.success(`⚡ Enriched: ${totalTickersResolved} tickers, ${totalLinksAdded} mesh links added`);
      setTimeout(() => refetch(), 1500);
    } catch (err: any) {
      toast.error(`Enrichment failed: ${err.message}`);
    } finally {
      setEnriching(false);
    }
  }, [graphData.nodes, refetch, triggerSpider]);

  // ═══ % Holdings Toggle ═══
  const handleFetchHoldings = useCallback(() => {
    const tokenNode = graphData.nodes.find(n => n.type === 'token');
    if (!tokenNode) {
      toast.error('No token node found — search a token first');
      return;
    }
    const tokenMint = tokenNode.fullId || tokenNode.id.split(':').slice(1).join(':');
    holdings.fetchHoldings(graphData.nodes, tokenMint);
  }, [graphData.nodes, holdings.fetchHoldings]);

  // ═══ CTO Auto-Detection for Token Nodes ═══
  useEffect(() => {
    const tokenNodes = graphData.nodes.filter(n => n.type === 'token');
    for (const token of tokenNodes) {
      const mint = token.fullId || token.id.split(':').slice(1).join(':');
      if (ctoChecked.has(mint)) continue;
      setCtoChecked(prev => new Set([...prev, mint]));
      
      detectCTO(mint).then(result => {
        if (result.isCTO) {
          const flag = buildCTORedFlag(result);
          if (flag) {
            // Inject CTO flag into the token node
            const existingNode = graphData.nodes.find(n => n.fullId === mint || n.id === `token:${mint}`);
            if (existingNode) {
              if (!existingNode.redFlags) existingNode.redFlags = [];
              // Don't duplicate
              if (!existingNode.redFlags.some(f => f.shortLabel.includes('Community Takeover'))) {
                existingNode.redFlags.push(flag);
                toast.warning(`🔄 CTO detected on ${existingNode.label}`, {
                  description: `${result.changes.length} social links changed`,
                });
              }
            }
          }
        }
      });
    }
  }, [graphData.nodes, ctoChecked, detectCTO, buildCTORedFlag]);

  // Double-click detection via click timer
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickNodeRef = useRef<string | null>(null);

  const handleNodeClick = useCallback((node: any) => {
    const nodeId = node.id as string;
    const meshNode = node as MeshNode;

    // If node has red flags, show the explainer dialog on single-click of the flag area
    // We use double-click for spider, single-click for red flag dialog if flagged
    
    // If same node clicked within 300ms → double-click
    if (lastClickNodeRef.current === nodeId && clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      lastClickNodeRef.current = null;

      // ── Double-click: trigger spider/enrichment ──
      const parts = nodeId.split(':');
      const type = parts[0];
      const rawId = parts.slice(1).join(':');

      if (type === 'wallet' || type === 'token') {
        console.log(`[BubbleMap] Double-click spidering: ${rawId}`);
        triggerSpider(rawId, 'quick');
      }
      if (type === 'x_account') {
        // ═══ Cross-reference: find all communities this handle is in ═══
        console.log(`[BubbleMap] Double-click cross-referencing @${rawId} across communities`);
        setCommunitySearching(true);
        toast.info(`🔍 Searching all communities for @${rawId}...`);
        (async () => {
          try {
            // Query x_communities where this handle appears as admin or mod
            const cleanHandle = rawId.replace(/^@/, '').toLowerCase();
            const { data: communities, error } = await supabase
              .from('x_communities')
              .select('community_id, name, community_url, admin_usernames, moderator_usernames')
              .or(`admin_usernames.cs.{${cleanHandle}},moderator_usernames.cs.{${cleanHandle}}`);
            
            if (error) throw error;
            
            if (!communities || communities.length === 0) {
              toast.warning(`@${cleanHandle} not found in any other X Communities`);
            } else {
              toast.success(`Found @${cleanHandle} in ${communities.length} communities`);
              
              // Upsert mesh links for each discovered community
              const upserts: any[] = [];
              for (const comm of communities) {
                const isAdmin = (comm.admin_usernames || []).map((u: string) => u.toLowerCase()).includes(cleanHandle);
                upserts.push({
                  source_type: 'x_community',
                  source_id: comm.community_id,
                  linked_type: 'x_account',
                  linked_id: cleanHandle,
                  relationship: isAdmin ? 'admin_of' : 'mod_of',
                  confidence: 100,
                  discovered_via: 'x_cross_reference',
                  evidence: { community_name: comm.name },
                });
              }
              
              if (upserts.length > 0) {
                await supabase
                  .from('reputation_mesh')
                  .upsert(upserts, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
              }
              
              // Expand the handle node and refresh to show new links
              expandEntity(nodeId);
              setTimeout(() => refetch(), 1000);
            }
          } catch (err: any) {
            toast.error(`Cross-reference failed: ${err.message}`);
          } finally {
            setCommunitySearching(false);
          }
        })();
      }
      if (type === 'x_community') {
        console.log(`[BubbleMap] Double-click enriching X Community: ${rawId}`);
        setCommunitySearching(true);
        // Ensure Apify tracker is active for this enrichment call
        if (!apifySnapshot.isTracking) {
          resetApifyTracking();
          startApifyTracking();
        }
        toast.info(`👥 Enriching X Community ${rawId.slice(0, 16)}...`);
        (async () => {
          try {
            const tokenNode = graphData.nodes.find(n => n.type === 'token');
            const walletNode = graphData.nodes.find(n => n.type === 'wallet');
            const { data, error } = await supabase.functions.invoke('x-community-enricher', {
              body: {
                communityUrl: `https://x.com/i/communities/${rawId}`,
                linkedTokenMint: tokenNode?.id.split(':').slice(1).join(':'),
                linkedWallet: walletNode?.id.split(':').slice(1).join(':'),
              },
            });
            if (error) throw error;
            toast.success(`Found ${data?.admins?.length || 0} admins, ${data?.moderators?.length || 0} mods`);
            setTimeout(() => refetch(), 1000);
          } catch (err: any) {
            toast.error(`Community enrichment failed: ${err.message}`);
          } finally {
            setCommunitySearching(false);
          }
        })();
      }
      return;
    }

    // ── Single click: always expand + center. Show red flag as toast hint, not blocking dialog ──
    lastClickNodeRef.current = nodeId;
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      lastClickNodeRef.current = null;
      
      // Always expand the node
      expandEntity(nodeId);
      if (graphRef.current) {
        graphRef.current.centerAt(node.x, node.y, 800);
        graphRef.current.zoom(2, 800);
      }
      
      // Show red flag as a non-blocking toast with option to view details
      if (meshNode.redFlags && meshNode.redFlags.length > 0) {
        const flagCount = meshNode.redFlags.length;
        const topFlag = meshNode.redFlags[0];
        toast.warning(`🚩 ${flagCount} red flag${flagCount > 1 ? 's' : ''}: ${topFlag.shortLabel}`, {
          description: 'Click to view details',
          action: {
            label: 'View',
            onClick: () => setRedFlagDialog({ node: meshNode, flags: meshNode.redFlags! }),
          },
          duration: 5000,
        });
      }
    }, 300);
  }, [expandEntity, triggerSpider, graphData.nodes, refetch, apifySnapshot.isTracking, resetApifyTracking, startApifyTracking]);

  const handleNodeRightClick = useCallback((node: any) => {
    const parts = (node.id as string).split(':');
    const type = parts[0];
    const id = parts.slice(1).join(':');
    focusOnEntity(id, type);
  }, [focusOnEntity]);

  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const meshNode = node as MeshNode & { x: number; y: number };
    let color = ENTITY_COLORS[meshNode.type] || '#888';
    const size = Math.max(4, Math.min(meshNode.val * 3 + 3, 20));
    const isFocused = focusedEntity && meshNode.id.includes(focusedEntity.id);
    const hasRedFlags = meshNode.redFlags && meshNode.redFlags.length > 0;

    // ═══ Admin/Mod role-based coloring for x_account nodes ═══
    const isAdmin = meshNode.type === 'x_account' && meshNode.role === 'admin';
    const isMod = meshNode.type === 'x_account' && meshNode.role === 'mod';
    if (isAdmin) color = '#f59e0b'; // amber/gold for admins
    if (isMod) color = '#06b6d4';   // cyan for mods

    if (isFocused) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
    }

    // Red flag glow for flagged nodes (blinking via time-based alpha)
    if (hasRedFlags) {
      const blinkAlpha = 0.3 + 0.4 * Math.abs(Math.sin(Date.now() / 400));
      const isCritical = meshNode.redFlags!.some(f => f.severity === 'critical');
      ctx.shadowColor = isCritical ? '#ef4444' : '#f97316';
      ctx.shadowBlur = 12;
      
      // Pulsing danger ring
      ctx.beginPath();
      ctx.arc(meshNode.x, meshNode.y, size + 4, 0, 2 * Math.PI);
      ctx.strokeStyle = isCritical ? `rgba(239,68,68,${blinkAlpha})` : `rgba(249,115,22,${blinkAlpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Token nodes: show success/failure via ring color
    if (meshNode.type === 'token') {
      ctx.beginPath();
      ctx.arc(meshNode.x, meshNode.y, size + 2, 0, 2 * Math.PI);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Admin/Mod ring indicator
    if (isAdmin || isMod) {
      ctx.beginPath();
      ctx.arc(meshNode.x, meshNode.y, size + 3, 0, 2 * Math.PI);
      ctx.strokeStyle = isAdmin ? '#f59e0b' : '#06b6d4';
      ctx.lineWidth = 2;
      ctx.setLineDash(isMod ? [3, 2] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(meshNode.x, meshNode.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = isFocused ? '#fff' : 'rgba(255,255,255,0.3)';
    ctx.lineWidth = isFocused ? 2 : 0.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // KYC root: draw a diamond/crown marker
    if (meshNode.type === 'kyc_root') {
      ctx.fillStyle = '#fff';
      ctx.font = `${Math.max(8, 12 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏦', meshNode.x, meshNode.y);
    }

    // Admin crown / Mod shield emoji on node
    if (isAdmin) {
      ctx.font = `${Math.max(7, 10 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👑', meshNode.x, meshNode.y);
    } else if (isMod) {
      ctx.font = `${Math.max(7, 10 / globalScale)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', meshNode.x, meshNode.y);
    }

    // 🚩 Red flag badge on flagged nodes
    if (hasRedFlags) {
      const flagSize = Math.max(7, 10 / globalScale);
      ctx.font = `${flagSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🚩', meshNode.x + size + 3, meshNode.y - size - 2);
    }

    // Always show friendly label with role suffix
    let labelText = meshNode.label;
    if (isAdmin) labelText = `${labelText} (Admin)`;
    else if (isMod) labelText = `${labelText} (Mod)`;
    if (labelText) {
      const labelFontSize = Math.max(6, 9 / globalScale);
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = hasRedFlags ? 'rgba(239,68,68,0.95)' : 
                      isAdmin ? 'rgba(245,158,11,0.95)' : 
                      isMod ? 'rgba(6,182,212,0.95)' : 
                      'rgba(255,255,255,0.9)';
      ctx.fillText(labelText, meshNode.x, meshNode.y + size + 3);
    }

    // % Holdings overlay
    if (holdings.showOverlay && meshNode.type === 'wallet') {
      const holdingInfo = holdings.holdings.get(meshNode.id);
      if (holdingInfo && holdingInfo.percentage > 0) {
        const pctText = holdingInfo.percentage >= 1 
          ? `${holdingInfo.percentage.toFixed(1)}%` 
          : `${holdingInfo.percentage.toFixed(2)}%`;
        const pctFontSize = Math.max(7, 10 / globalScale);
        ctx.font = `bold ${pctFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        
        // Background pill
        const textWidth = ctx.measureText(pctText).width;
        const pillX = meshNode.x - textWidth / 2 - 3;
        const pillY = meshNode.y - size - pctFontSize - 4;
        ctx.fillStyle = holdingInfo.percentage >= 5 ? 'rgba(239,68,68,0.85)' : 
                        holdingInfo.percentage >= 1 ? 'rgba(234,179,8,0.85)' : 
                        'rgba(34,197,94,0.75)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, textWidth + 6, pctFontSize + 4, 3);
        ctx.fill();
        
        ctx.fillStyle = '#fff';
        ctx.fillText(pctText, meshNode.x, pillY + 2);
      }
    }
  }, [focusedEntity, holdings.showOverlay, holdings.holdings]);

  const paintLink = useCallback((link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const src = link.source;
    const tgt = link.target;
    if (!src.x || !tgt.x) return;

    const rel = link.relationship || '';
    
    // Color links by relationship type
    let strokeColor = 'rgba(255,255,255,0.1)';
    if (rel.includes('funded') || rel.includes('directly_funded')) strokeColor = 'rgba(34,197,94,0.25)';
    else if (rel.includes('created')) strokeColor = 'rgba(234,179,8,0.2)';
    else if (rel.includes('kyc')) strokeColor = 'rgba(255,255,255,0.2)';

    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(tgt.x, tgt.y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    if (globalScale > 2) {
      const midX = (src.x + tgt.x) / 2;
      const midY = (src.y + tgt.y) / 2;
      const fontSize = Math.max(5, 7 / globalScale);
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(rel, midX, midY);
    }
  }, []);

  const trafficLightColor = (tl?: string) => {
    switch (tl) {
      case 'RED': return 'text-red-400';
      case 'YELLOW': return 'text-yellow-400';
      case 'GREEN': return 'text-green-400';
      case 'BLUE': return 'text-blue-400';
      default: return 'text-muted-foreground';
    }
  };

  // Apply node cap
  const isOverCap = !capBroken && graphData.nodes.length > nodeCap;
  const displayData = isOverCap
    ? (() => {
        const cappedNodes = graphData.nodes.slice(0, nodeCap);
        const cappedIds = new Set(cappedNodes.map(n => n.id));
        return {
          nodes: cappedNodes,
          links: graphData.links.filter(l => 
            cappedIds.has(typeof l.source === 'string' ? l.source : (l.source as any).id) &&
            cappedIds.has(typeof l.target === 'string' ? l.target : (l.target as any).id)
          ),
        };
      })()
    : graphData;

  // Count entity types in current graph
  const typeCounts = displayData.nodes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Animation tick for blinking red flags
  const hasAnyRedFlags = displayData.nodes.some(n => n.redFlags && n.redFlags.length > 0);
  useEffect(() => {
    if (!hasAnyRedFlags || !graphRef.current) return;
    let animFrame: number;
    const tick = () => {
      if (graphRef.current) {
        // Force canvas repaint for blink animation
        graphRef.current.refresh?.();
      }
      animFrame = requestAnimationFrame(tick);
    };
    // Throttle to ~15fps for blink
    const interval = setInterval(() => {
      if (graphRef.current) graphRef.current.refresh?.();
    }, 66);
    return () => {
      cancelAnimationFrame(animFrame);
      clearInterval(interval);
    };
  }, [hasAnyRedFlags]);

  // Count red-flagged nodes
  const redFlagCount = displayData.nodes.filter(n => n.redFlags && n.redFlags.length > 0).length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                🫧 Mesh Bubble Map
              </CardTitle>
              <CardDescription>
                Interactive visualization of the reputation mesh. Enter any entity to explore.
              </CardDescription>
            </div>
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <Button
                variant={viewMode === 'bubble' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setViewMode('bubble')}
              >
                <Network className="h-3 w-3 mr-1" />
                Bubble
              </Button>
              <Button
                variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setViewMode('tree')}
              >
                <GitBranch className="h-3 w-3 mr-1" />
                Tree
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Search + Actions Row */}
          <div className="flex gap-2">
            <Input
              placeholder="Paste wallet, token mint, or @handle..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 font-mono text-xs"
            />
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={isLoading}>
              <Search className="h-3.5 w-3.5 mr-1" /> Focus
            </Button>
            <Button variant="ghost" size="sm" onClick={resetView}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Action Buttons */}
          {graphData.nodes.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleFindKYC}
                disabled={kycSearching}
                className="text-xs h-7 border-amber-500/30 hover:bg-amber-500/10 text-amber-400"
              >
                {kycSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Key className="h-3 w-3 mr-1" />}
                Find KYC Root
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFindTokens}
                disabled={tokenSearching}
                className="text-xs h-7 border-yellow-500/30 hover:bg-yellow-500/10 text-yellow-400"
              >
                {tokenSearching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Coins className="h-3 w-3 mr-1" />}
                Find All Tokens
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnrichAllTokens}
                disabled={enriching}
                className="text-xs h-7 border-cyan-500/30 hover:bg-cyan-500/10 text-cyan-400"
              >
                {enriching ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                Enrich All Tokens
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSpider}
                disabled={spiderStatus.active}
                className="text-xs h-7"
              >
              <Radar className="h-3 w-3 mr-1" /> Deep Spider
              </Button>
              {/* % Holdings Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={holdings.showOverlay ? holdings.toggleOverlay : handleFetchHoldings}
                disabled={holdings.isLoading}
                className={`text-xs h-7 ${holdings.showOverlay 
                  ? 'border-green-500/50 bg-green-500/10 text-green-400' 
                  : 'border-purple-500/30 hover:bg-purple-500/10 text-purple-400'}`}
              >
                {holdings.isLoading ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : holdings.showOverlay ? (
                  <EyeOff className="h-3 w-3 mr-1" />
                ) : (
                  <PieChart className="h-3 w-3 mr-1" />
                )}
                {holdings.showOverlay ? 'Hide %' : 'Show %'}
              </Button>
            </div>
          )}

          {/* Type Filters */}
          <div className="flex flex-wrap gap-1">
            {Object.entries(ENTITY_LABELS).map(([type, label]) => (
              <Badge
                key={type}
                variant={typeFilters.has(type) ? "default" : "outline"}
                className="cursor-pointer text-[10px] px-1.5 py-0 transition-all"
                style={{
                  backgroundColor: typeFilters.has(type) ? ENTITY_COLORS[type] + '33' : 'transparent',
                  borderColor: ENTITY_COLORS[type],
                  color: typeFilters.has(type) ? ENTITY_COLORS[type] : 'hsl(var(--muted-foreground))',
                }}
                onClick={() => toggleTypeFilter(type)}
              >
                {label}
                {typeCounts[type] ? ` (${typeCounts[type]})` : ''}
              </Badge>
            ))}
          </div>

          {/* Stats + Credit Counter + Node Cap */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>{displayData.nodes.length} entities</span>
            <span>{displayData.links.length} connections</span>
            {redFlagCount > 0 && (
              <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] animate-pulse cursor-pointer"
                onClick={() => {
                  const flaggedNode = displayData.nodes.find(n => n.redFlags && n.redFlags.length > 0);
                  if (flaggedNode) setRedFlagDialog({ node: flaggedNode, flags: flaggedNode.redFlags! });
                }}
              >
                🚩 {redFlagCount} Flagged
              </Badge>
            )}
            {focusedEntity && (
              <span className="text-primary font-mono">
                {focusedEntity.id.slice(0, 16)}...
              </span>
            )}

            {/* Node Cap indicator */}
            {isOverCap && (
              <div className="flex items-center gap-1">
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                  CAP: {nodeCap}/{graphData.nodes.length}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-5 text-[10px] px-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-colors"
                  onClick={() => {
                    setCapBroken(true);
                    toast.info(`Node cap released — showing all ${graphData.nodes.length} nodes`);
                  }}
                >
                  <Unlock className="h-2.5 w-2.5 mr-1" />
                  Break Cap
                </Button>
              </div>
            )}
            {capBroken && graphData.nodes.length > NODE_CAP_DEFAULT && (
              <Badge className="bg-green-500/10 text-green-400 border-green-500/30 text-[10px]">
                UNCAPPED ({graphData.nodes.length})
              </Badge>
            )}
          </div>

          {/* Helius Credit Counter */}
          {creditSnapshot.isTracking && (
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="text-xs font-medium text-cyan-400">Helius API Credits (Live)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-cyan-300">
                    {creditSnapshot.totalCredits}
                  </span>
                  <span className="text-[10px] text-muted-foreground">credits</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    ({creditSnapshot.totalCalls} calls)
                  </span>
                </div>
              </div>
              
              {creditSnapshot.callLog.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {creditSnapshot.callLog.slice(-8).map((call, i) => (
                    <div key={i} className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                      <span className="truncate max-w-[200px]">{call.endpoint}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-cyan-400">{call.credits}cr</span>
                        <span>{call.responseMs}ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">
                  Session: {Math.round((Date.now() - creditSnapshot.sessionStart) / 1000)}s
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => { stopTracking(); resetTracking(); }}
                >
                  Reset
                </Button>
              </div>
            </div>
          )}

          {/* Apify Credit Counter */}
          {apifySnapshot.isTracking && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-medium text-orange-400">Apify Credits (Live)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-orange-300">
                    {apifySnapshot.totalCalls}
                  </span>
                  <span className="text-[10px] text-muted-foreground">runs</span>
                  <span className="font-mono text-xs text-orange-400">
                    ~${apifySnapshot.estimatedCostUsd.toFixed(2)}
                  </span>
                </div>
              </div>
              
              {apifySnapshot.callLog.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {apifySnapshot.callLog.slice(-6).map((call, i) => (
                    <div key={i} className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                      <span className="truncate max-w-[180px]">{call.functionName}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-orange-400">{call.credits}cr</span>
                        <span>{(call.responseMs / 1000).toFixed(1)}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">
                  Session: {Math.round((Date.now() - apifySnapshot.sessionStart) / 1000)}s
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => { stopApifyTracking(); resetApifyTracking(); }}
                >
                  Reset
                </Button>
              </div>
            </div>
          )}


          {spiderStatus.active && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Radar className="h-3.5 w-3.5 text-primary animate-spin" />
                <span className="text-xs font-medium text-primary">{spiderStatus.stage}</span>
              </div>
              {spiderStatus.meshLinksAdded !== undefined && spiderStatus.meshLinksAdded > 0 && (
                <div className="flex flex-wrap gap-3 text-[10px]">
                  <span>Links: <strong>{spiderStatus.meshLinksAdded}</strong></span>
                  {spiderStatus.score !== undefined && (
                    <span className={trafficLightColor(spiderStatus.trafficLight)}>
                      Score: <strong>{spiderStatus.score}/100</strong> {spiderStatus.trafficLight}
                    </span>
                  )}
                  {spiderStatus.inputType && (
                    <span>Type: <strong>{spiderStatus.inputType}</strong></span>
                  )}
                </div>
              )}
              {spiderStatus.recommendation && (
                <p className="text-[10px] text-muted-foreground">{spiderStatus.recommendation}</p>
              )}
              {spiderStatus.diagnostics && spiderStatus.diagnostics.length > 0 && (
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  Diagnostics ({spiderStatus.diagnostics.length})
                </button>
              )}
              {showDiagnostics && spiderStatus.diagnostics && (
                <div className="rounded bg-background/50 p-2 space-y-0.5 text-[10px] font-mono text-muted-foreground">
                  {spiderStatus.diagnostics.map((d, i) => (
                    <div key={i}>{d}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Spider Error - auto-dismiss if graph has populated despite the error */}
          {spiderStatus.error && (
            <div className={`rounded-lg border p-3 space-y-2 ${
              graphData.nodes.length > 0 
                ? 'border-yellow-500/30 bg-yellow-500/5' 
                : 'border-destructive/30 bg-destructive/5'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-3.5 w-3.5 ${graphData.nodes.length > 0 ? 'text-yellow-500' : 'text-destructive'}`} />
                  <span className={`text-xs ${graphData.nodes.length > 0 ? 'text-yellow-500' : 'text-destructive'}`}>
                    {graphData.nodes.length > 0 
                      ? `⚠️ Spider partial failure (graph loaded ${graphData.nodes.length} entities via other sources)`
                      : spiderStatus.error
                    }
                  </span>
                </div>
                {graphData.nodes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      // Clear the spider error since graph has data
                      // This is a UI-only dismiss
                      const el = document.getElementById('spider-error-panel');
                      if (el) el.style.display = 'none';
                    }}
                    className="text-[10px] h-5 px-2 text-muted-foreground"
                  >
                    Dismiss
                  </Button>
                )}
              </div>
              {spiderStatus.diagnostics && spiderStatus.diagnostics.length > 0 && (
                <>
                  <button
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showDiagnostics ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Diagnostics ({spiderStatus.diagnostics.length})
                  </button>
                  {showDiagnostics && (
                    <div className="rounded bg-background/50 p-2 space-y-0.5 text-[10px] font-mono text-muted-foreground">
                      {spiderStatus.diagnostics.map((d, i) => (
                        <div key={i}>{d}</div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {graphData.nodes.length === 0 && (
                <Button variant="outline" size="sm" onClick={handleSpider} className="text-[10px] h-6">
                  <Radar className="h-3 w-3 mr-1" /> Retry
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Graph Canvas */}
      <Card className="overflow-hidden">
        <div ref={containerRef} className="w-full" style={{ height: '600px', background: 'hsl(var(--background))' }}>
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Loading mesh graph...</p>
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
              onNodeRightClick={handleNodeRightClick}
              
              onNodeHover={(node: any) => setHoveredNode(node as MeshNode | null)}
              nodeLabel={(node: any) => {
                const n = node as MeshNode;
                const rawId = n.fullId || n.id.split(':').slice(1).join(':');
                return `${ENTITY_LABELS[n.type] || n.type}\n${rawId}\n${Math.round(n.val)} connections\n(double-click to spider/enrich)`;
              }}
              cooldownTicks={60}
              d3AlphaDecay={0.05}
              d3VelocityDecay={viewMode === 'tree' ? 0.45 : 0.4}
              dagMode={viewMode === 'tree' ? 'td' : undefined}
              dagLevelDistance={viewMode === 'tree' ? 80 : undefined}
              linkDirectionalParticles={(link: any) => {
                const rel = link.relationship || '';
                if (['same_kyc_root', 'same_team', 'same_developer'].includes(rel)) return 2;
                return 1;
              }}
              linkDirectionalParticleWidth={1.5}
              linkDirectionalParticleSpeed={(link: any) => {
                const rel = link.relationship || '';
                if (['same_kyc_root', 'same_team'].includes(rel)) return 0.008;
                return 0.004;
              }}
              linkDirectionalParticleColor={(link: any) => {
                const rel = link.relationship || '';
                if (rel.includes('funded')) return 'rgba(34,197,94,0.6)';
                if (rel.includes('created')) return 'rgba(234,179,8,0.6)';
                if (rel.includes('kyc')) return 'rgba(255,255,255,0.6)';
                return 'rgba(255,255,255,0.3)';
              }}
              linkDirectionalArrowLength={(link: any) => {
                const rel = link.relationship || '';
                if (['funded_by', 'directly_funded', 'created', 'created_by'].includes(rel)) return 5;
                return 0;
              }}
              linkDirectionalArrowRelPos={0.7}
              enableZoomInteraction={true}
              enablePanInteraction={true}
            />
          )}
        </div>
      </Card>

      {/* Hovered Node Info */}
      {hoveredNode && (
        <Card className="border-primary/30">
          <CardContent className="py-2 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div
                className="h-3 w-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: ENTITY_COLORS[hoveredNode.type] }}
              />
              <span className="font-medium">{ENTITY_LABELS[hoveredNode.type] || hoveredNode.type}</span>
              <span className="font-semibold">{hoveredNode.label}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {Math.round(hoveredNode.val)} conn
              </Badge>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground select-all break-all pl-5">
              {hoveredNode.fullId || hoveredNode.id.split(':').slice(1).join(':')}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Red Flag Explainer Dialog */}
      <Dialog open={!!redFlagDialog} onOpenChange={(open) => !open && setRedFlagDialog(null)}>
        <DialogContent className="max-w-lg border-red-500/30 bg-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              🚩 Intelligence Red Flag
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {redFlagDialog && (
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: ENTITY_COLORS[redFlagDialog.node.type] }} />
                  {ENTITY_LABELS[redFlagDialog.node.type]} — {redFlagDialog.node.label}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {redFlagDialog && (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {redFlagDialog.flags.map((flag, i) => (
                <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-red-400">{flag.shortLabel}</span>
                    <Badge 
                      variant={flag.severity === 'critical' ? 'destructive' : 'outline'}
                      className={flag.severity === 'critical' ? '' : 'border-orange-500/50 text-orange-400'}
                    >
                      {flag.severity.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                    {flag.explanation}
                  </div>
                </div>
              ))}
              <div className="text-[10px] text-muted-foreground font-mono break-all pt-2 border-t border-border">
                Entity ID: {redFlagDialog.node.fullId || redFlagDialog.node.id}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MeshGraphVisualizer;
