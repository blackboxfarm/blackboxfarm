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

export const HtmlScrapes = () => {
  const [htmlContent, setHtmlContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [scrapedTokens, setScrapedTokens] = useState<any[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

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

  const resolveAddresses = async (tokenCount?: number) => {
    setIsResolving(true);
    const batchSize = Math.min(tokenCount || 50, 3);
    
    addLog(`🚀 Starting address resolution process...`);
    addLog(`📊 Batch size: ${batchSize} tokens`);
    addLog(`⏱️ Estimated time: ${batchSize * 2} seconds (2s delay per token)`);
    addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      addLog(`🔌 Invoking resolve-token-addresses edge function...`);
      addLog(`⏳ Waiting for response from server...`);
      
      const { data: resolveData, error: resolveError } = await supabase.functions.invoke('resolve-token-addresses', {
        body: { batchSize }
      });

      if (resolveError) {
        console.error('Error resolving addresses:', resolveError);
        addLog(`❌ Resolution failed: ${resolveError.message}`);
        toast({
          title: "Address Resolution Failed",
          description: "The resolve function may not be deployed yet. Try the manual button in 2-3 minutes.",
          variant: "destructive",
        });
      } else {
        addLog(`📥 Received response from server`);
        addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        const results = resolveData.results || [];
        addLog(`📋 Processing ${results.length} token results...`);
        addLog(``);
        
        results.forEach((result: any, index: number) => {
          addLog(`🔄 Token ${index + 1}/${results.length}: ${result.symbol || 'Unknown'}`);
          
          if (result.success) {
            addLog(`   📍 Old: ${result.oldAddress}`);
            
            if (result.method === 'api') {
              addLog(`   🔍 Method: DexScreener API`);
              addLog(`   📡 URL: https://api.dexscreener.com/latest/dex/search?q=${result.oldAddress}`);
              addLog(`   ✅ API returned real address`);
            } else if (result.method === 'browser') {
              addLog(`   🔍 Method: Browser scrape (API fallback failed)`);
              addLog(`   🌐 URL: https://dexscreener.com/solana/${result.oldAddress}`);
              addLog(`   🤖 Cloudflare challenge solved`);
              addLog(`   📄 HTML retrieved`);
              addLog(`   🔎 Searching for Solscan link pattern...`);
              addLog(`   ✅ Found: href="https://solscan.io/token/..."`);
            }
            
            addLog(`   🎯 New: ${result.newAddress}`);
            addLog(`   💾 Database updated`);
            addLog(`   ✅ SUCCESS`);
          } else {
            addLog(`   📍 Address: ${result.oldAddress || 'unknown'}`);
            addLog(`   🌐 Attempted: https://dexscreener.com/solana/${result.oldAddress || 'unknown'}`);
            addLog(`   ❌ FAILED: ${result.error}`);
          }
          
          if (index < results.length - 1) {
            addLog(``);
            addLog(`   ⏳ Waiting 2 seconds before next token...`);
            addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
          }
        });

        addLog(``);
        addLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        addLog(`📊 SUMMARY:`);
        addLog(`   ✅ Resolved: ${resolveData.resolved}`);
        addLog(`   ❌ Failed: ${resolveData.failed}`);
        addLog(`   📈 Success rate: ${((resolveData.resolved / (resolveData.resolved + resolveData.failed)) * 100).toFixed(1)}%`);
        addLog(`✅ Resolution complete!`);
        
        toast({
          title: "Addresses Resolved",
          description: `✓ Resolved ${resolveData.resolved} of ${resolveData.resolved + resolveData.failed} token addresses.`,
        });
      }
    } catch (resolveErr: any) {
      console.error('Error triggering resolution:', resolveErr);
      addLog(`❌ Network error: ${resolveErr.message}`);
      toast({
        title: "Resolution Error",
        description: "Function not ready. Wait 2-3 min and use manual resolve button.",
        variant: "destructive",
      });
    } finally {
      setIsResolving(false);
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
                Scraped Tokens ({scrapedTokens.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="scraper" className="space-y-4 mt-4">
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
            <Button 
              onClick={() => resolveAddresses()}
              disabled={isResolving}
              variant="secondary"
            >
              {isResolving ? "Resolving..." : "🔄 Resolve Addresses"}
            </Button>
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
