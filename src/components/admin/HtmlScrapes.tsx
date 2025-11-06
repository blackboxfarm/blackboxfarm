import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileUp, Terminal, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

export const HtmlScrapes = () => {
  const [htmlContent, setHtmlContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [scrapedTokens, setScrapedTokens] = useState<any[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [resolutionStatus, setResolutionStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [resolutionSummary, setResolutionSummary] = useState<{ resolved: number; failed: number } | null>(null);
  const [resolutionProgress, setResolutionProgress] = useState(0);
  const [totalPending, setTotalPending] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logMessages]);

  const loadScrapedTokens = async () => {
    setIsLoadingTokens(true);
    try {
      const { data, error } = await supabase
        .from('scraped_tokens' as any)
        .select('*')
        .order('first_seen_at', { ascending: false });

      if (error) throw error;
      setScrapedTokens(data || []);
    } catch (error: any) {
      console.error('Error loading scraped tokens:', error);
      toast({
        title: "Error",
        description: "Failed to load scraped tokens",
        variant: "destructive"
      });
    } finally {
      setIsLoadingTokens(false);
    }
  };

  useEffect(() => {
    loadScrapedTokens();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setHtmlContent(text);
      toast({
        title: "File loaded",
        description: `Loaded ${file.name}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to read file",
        variant: "destructive"
      });
    }
  };

  const extractTokensFromHtml = (html: string) => {
    const tokens: Array<{ mint: string; symbol?: string; name?: string }> = [];
    
    // Parse HTML and extract token data from DexScreener format
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all DexScreener table rows
    const tokenRows = doc.querySelectorAll('a.ds-dex-table-row');
    
    tokenRows.forEach((row) => {
      // Extract mint address from href="/solana/{token_mint}"
      const href = row.getAttribute('href');
      if (!href || !href.startsWith('/solana/')) return;
      
      const mint = href.replace('/solana/', '');
      
      // Validate Solana address format (base58, 32-44 characters)
      if (mint.length < 32 || mint.length > 44) return;
      
      // Extract symbol
      const symbolElement = row.querySelector('.ds-dex-table-row-base-token-symbol');
      const symbol = symbolElement?.textContent?.trim();
      
      // Extract name
      const nameElement = row.querySelector('.ds-dex-table-row-base-token-name-text');
      const name = nameElement?.textContent?.trim();
      
      tokens.push({ 
        mint, 
        symbol: symbol || undefined,
        name: name || undefined
      });
    });
    
    return tokens;
  };

  const handleScrape = async () => {
    if (!htmlContent.trim()) {
      toast({
        title: "No content",
        description: "Please paste HTML content first",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    addLog("🔍 Starting HTML scrape...");

    try {
      const tokens = extractTokensFromHtml(htmlContent);
      addLog(`📊 Scraped ${tokens.length} token addresses from HTML`);
      
      if (tokens.length === 0) {
        addLog("❌ No tokens found in HTML");
        toast({
          title: "No tokens found",
          description: "Could not extract any token addresses from the HTML",
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

      addLog("💾 Converting to unique URLs and saving to database...");

      // Insert tokens into database
      const { error } = await supabase
        .from('scraped_tokens' as any)
        .upsert(
          tokens.map(token => ({
            token_mint: token.mint,
            symbol: token.symbol,
            name: token.name,
            discovery_source: 'html_scrape',
            first_seen_at: new Date().toISOString()
          })),
          { onConflict: 'token_mint' }
        );

      if (error) throw error;

      addLog(`✅ Saved ${tokens.length} tokens to database`);
      toast({
        title: "Success",
        description: `Extracted and saved ${tokens.length} token(s) with mixed-case addresses`,
      });

      setHtmlContent("");
      
    } catch (error: any) {
      console.error('Error scraping HTML:', error);
      addLog(`❌ Error: ${error.message}`);
      toast({
        title: "Error",
        description: error.message || "Failed to process HTML",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resolveAddresses = async () => {
    setIsResolving(true);
    setResolutionStatus('processing');
    setResolutionSummary(null);
    setProcessedCount(0);
    abortControllerRef.current = new AbortController();
    
    // Get count of pending tokens
    const { count } = await supabase
      .from('scraped_tokens' as any)
      .select('*', { count: 'exact', head: true })
      .neq('validation_status', 'valid');
    
    const pending = count || 0;
    setTotalPending(pending);
    setResolutionProgress(0);
    
    addLog(`🚀 Starting one-by-one address resolution...`);
    addLog(`📊 Total pending tokens: ${pending}`);
    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    addLog(``);

    let totalResolved = 0;
    let totalFailed = 0;
    let tokenNumber = 1;

    try {
      while (true) {
        if (abortControllerRef.current?.signal.aborted) {
          addLog(`🛑 Resolution cancelled by user`);
          setResolutionStatus('idle');
          break;
        }

        addLog(`🔄 Processing token ${tokenNumber} of ${pending}...`);
        
        // Fetch the next pending token deterministically to avoid repeats
        const { data: nextBatch, error: nextErr } = await supabase
          .from('scraped_tokens' as any)
          .select('id, symbol, token_mint')
          .eq('discovery_source', 'html_scrape')
          .eq('validation_status', 'pending')
          .order('first_seen_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(1);

        if (nextErr) {
          addLog(`❌ Failed to fetch next token: ${nextErr.message}`);
          totalFailed++;
          break;
        }

        const target = (nextBatch && nextBatch.length > 0) ? (nextBatch[0] as any) : null;
        if (!target) {
          addLog(`✅ No more pending tokens found`);
          break;
        }

        const targetId = (target?.id as string | number | undefined);
        const { data: resolveData, error: resolveError } = await supabase.functions.invoke('resolve-token-addresses', {
          body: { batchSize: 1, tokenId: targetId }
        });

        if (abortControllerRef.current?.signal.aborted) {
          addLog(`🛑 Resolution cancelled by user`);
          setResolutionStatus('idle');
          break;
        }

        if (resolveError) {
          console.error('Error resolving token:', resolveError);
          addLog(`❌ Token ${tokenNumber} - FAILED`);
          addLog(`   ⚠️ Reason: ${resolveError.message}`);
          // Continue to next token even if the invocation failed
          totalFailed++;
        } else {
          const results = resolveData?.results || [];
          const result = results[0];

          if (result) {
            const sym = result.symbol || result.tokenMint || result.oldAddress || 'Unknown';
            if (result.success) {
              addLog(`✅ Token ${tokenNumber}: ${sym} - RESOLVED`);
              if (result.newAddress) {
                addLog(`   📍 Address: ${result.newAddress}`);
              }
              totalResolved++;
            } else if (result.status === 'not_found') {
              addLog(`⚠️ Token ${tokenNumber}: ${sym} - NOT FOUND`);
              addLog(`   ⚠️ Reason: ${result.error || 'Token not found on DexScreener'}`);
              totalFailed++;
            } else {
              addLog(`❌ Token ${tokenNumber}: ${sym} - FAILED`);
              addLog(`   ⚠️ Reason: ${result.error || 'Unknown error'}`);
              totalFailed++;
            }
          } else {
            addLog(`✅ No more pending tokens found`);
            break;
          }
        }
        
        // Update progress
        const newProcessed = tokenNumber;
        setProcessedCount(newProcessed);
        setResolutionProgress((newProcessed / pending) * 100);

        // Check if we're done
        if (!resolveData?.results || resolveData.results.length === 0) {
          addLog(``);
          addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          addLog(`📊 FINAL SUMMARY:`);
          addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          addLog(`   ✅ Successfully Resolved: ${totalResolved} tokens`);
          addLog(`   ❌ Failed to Resolve: ${totalFailed} tokens`);
          addLog(`   📊 Total Processed: ${totalResolved + totalFailed} tokens`);
          if (totalResolved + totalFailed > 0) {
            addLog(`   📈 Success Rate: ${((totalResolved / (totalResolved + totalFailed)) * 100).toFixed(1)}%`);
          }
          addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          addLog(`✅ All pending tokens processed!`);
          
          setResolutionStatus('complete');
          setResolutionSummary({ resolved: totalResolved, failed: totalFailed });
          
          toast({
            title: "✅ Resolution Complete!",
            description: `Resolved ${totalResolved} of ${totalResolved + totalFailed} tokens.`,
          });
          
          await loadScrapedTokens();
          break;
        }

        tokenNumber++;
        addLog(``);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (resolveErr: any) {
      console.error('Error triggering resolution:', resolveErr);
      addLog(`❌ Network error: ${resolveErr.message}`);
      setResolutionStatus('error');
      toast({
        title: "Resolution Error",
        description: "Failed to resolve token addresses.",
        variant: "destructive",
      });
    } finally {
      setIsResolving(false);
      abortControllerRef.current = null;
    }
  };

  const cancelResolve = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      addLog(`🛑 Cancellation requested...`);
      setIsResolving(false);
      setResolutionStatus('idle');
      toast({
        title: "Cancelled",
        description: "Address resolution cancelled",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>HTML Scrapes</CardTitle>
          <CardDescription>
            Paste DexScreener HTML source to extract token addresses
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="scraper" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="scraper">
                <Upload className="mr-2 h-4 w-4" />
                Scraper
              </TabsTrigger>
              <TabsTrigger value="list" onClick={loadScrapedTokens}>
                <List className="mr-2 h-4 w-4" />
                {(() => {
                  const done = scrapedTokens.filter(t => t.validation_status === 'valid').length;
                  const pending = scrapedTokens.length - done;
                  return `Scraped Tokens: ${pending} TBA / ${done} Done (${scrapedTokens.length})`;
                })()}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scraper" className="space-y-4 mt-4">
          {resolutionSummary && resolutionStatus === 'complete' && (
            <Card className="bg-primary/5 border-primary">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">✅ Resolution Complete!</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Successfully resolved {resolutionSummary.resolved} of {resolutionSummary.resolved + resolutionSummary.failed} tokens
                      {resolutionSummary.failed > 0 && ` (${resolutionSummary.failed} failed)`}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => {
                      setResolutionStatus('idle');
                      setResolutionSummary(null);
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          {resolutionStatus === 'error' && (
            <Card className="bg-destructive/5 border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">❌ Resolution Failed</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Check the logs below for error details
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setResolutionStatus('idle')}
                  >
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="flex gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button 
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex-1"
            >
              <FileUp className="mr-2 h-4 w-4" />
              Upload HTML File
            </Button>
            <Button 
              onClick={handleScrape} 
              disabled={isProcessing || !htmlContent.trim()}
              className="flex-1"
            >
              <Upload className="mr-2 h-4 w-4" />
              {isProcessing ? "Processing..." : "Extract & Save Tokens"}
            </Button>
          </div>

          <div className="space-y-2">
            {isResolving && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Progress: {processedCount} / {totalPending} tokens</span>
                  <span>{resolutionProgress.toFixed(0)}%</span>
                </div>
                <Progress value={resolutionProgress} className="h-2" />
              </div>
            )}

            <div className="flex gap-2">
              {!isResolving ? (
                <Button 
                  onClick={resolveAddresses}
                  variant="secondary"
                  className="flex-1"
                >
                  🔄 Resolve Addresses
                </Button>
              ) : (
                <Button 
                  onClick={cancelResolve}
                  variant="destructive"
                  className="flex-1"
                >
                  🛑 Cancel
                </Button>
              )}
            </div>
          </div>
          <Textarea
            placeholder="Paste HTML content from DexScreener page here or upload an HTML file..."
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            className="h-20 font-mono text-xs"
          />
          
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Terminal className="h-4 w-4" />
              <span>Processing Log</span>
              {logMessages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLogMessages([])}
                  className="h-6 text-xs ml-auto"
                >
                  Clear
                </Button>
              )}
            </div>
            <ScrollArea className="h-[480px] rounded-md border bg-muted/50 p-4">
              <div className="space-y-1 font-mono text-xs">
                {logMessages.length === 0 ? (
                  <div className="text-muted-foreground italic">
                    No activity yet. Upload HTML or click "Extract & Save Tokens" to begin.
                  </div>
                ) : (
                  <>
                    {logMessages.map((msg, idx) => (
                      <div key={idx} className="whitespace-pre-wrap break-all">
                        {msg}
                      </div>
                    ))}
                    <div ref={logEndRef} />
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
            </TabsContent>

            <TabsContent value="list" className="mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    All Scraped Tokens ({scrapedTokens.length})
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadScrapedTokens}
                    disabled={isLoadingTokens}
                  >
                    {isLoadingTokens ? "Loading..." : "Refresh"}
                  </Button>
                </div>
                <ScrollArea className="h-[480px] rounded-md border bg-muted/50 p-4">
                  <div className="space-y-1 font-mono text-xs">
                    {isLoadingTokens ? (
                      <div className="text-muted-foreground italic">Loading tokens...</div>
                    ) : scrapedTokens.length === 0 ? (
                      <div className="text-muted-foreground italic">No tokens scraped yet</div>
                    ) : (
                      scrapedTokens.map((token, idx) => (
                        <div key={token.token_mint} className="py-1 border-b border-border/50 last:border-0">
                          <div className="flex items-start gap-2">
                            <span className="text-muted-foreground min-w-[40px]">{idx + 1}.</span>
                            <div className="flex-1 space-y-0.5">
                              <div className="break-all">{token.token_mint}</div>
                              {token.symbol && (
                                <div className="text-muted-foreground">
                                  Symbol: {token.symbol} {token.name && `(${token.name})`}
                                </div>
                              )}
                              {token.validation_status && (
                                <div className={`text-[10px] ${
                                  token.validation_status === 'valid' ? 'text-green-500' :
                                  token.validation_status === 'not_found' ? 'text-yellow-500' :
                                  token.validation_status === 'invalid' ? 'text-red-500' :
                                  'text-blue-500'
                                }`}>
                                  Status: {token.validation_status}
                                  {token.validation_error && ` - ${token.validation_error}`}
                                </div>
                              )}
                              <div className="text-muted-foreground text-[10px]">
                                {new Date(token.first_seen_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
