import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileUp, Terminal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export const HtmlScrapes = () => {
  const [htmlContent, setHtmlContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
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
        description: `Extracted and saved ${tokens.length} token(s). Starting address resolution...`,
      });

      setHtmlContent("");
      
      // Trigger address resolution separately with better error handling
      setTimeout(() => resolveAddresses(tokens.length), 1000);
      
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
    const batchSize = Math.min(tokenCount || 50, 3); // Reduced to 3 to avoid timeouts
    
    addLog(`🌐 Starting address resolution for ${batchSize} tokens...`);
    addLog("📍 Converting lowercase URLs to DexScreener pages...");
    addLog("⏳ This may take 10-20 seconds (2s delay between each token)...");

    try {
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
        const results = resolveData.results || [];
        
        results.forEach((result: any, index: number) => {
          if (result.success) {
            addLog(`🕷️ Spidering ${result.symbol}...`);
            addLog(`✅ Success: Retrieved HTML & Regex'd the Token Address`);
            addLog(`🎯 CA = ${result.newAddress}`);
          } else {
            addLog(`🕷️ Spidering ${result.symbol}...`);
            addLog(`❌ Fail: ${result.error}`);
          }
          
          if (index < results.length - 1) {
            addLog("⏭️ Fetching next URL...");
          }
        });

        addLog(`✅ Resolution complete: ${resolveData.resolved}/${resolveData.resolved + resolveData.failed} tokens resolved`);
        
        toast({
          title: "Addresses Resolved",
          description: `✓ Resolved ${resolveData.resolved} of ${tokenCount || 'pending'} token addresses.`,
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
        </CardContent>
      </Card>
    </div>
  );
};
