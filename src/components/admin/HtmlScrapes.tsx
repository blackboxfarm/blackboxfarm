import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileUp } from "lucide-react";
import { Input } from "@/components/ui/input";

export const HtmlScrapes = () => {
  const [htmlContent, setHtmlContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.html')) {
      toast({
        title: "Invalid file",
        description: "Please upload an HTML file",
        variant: "destructive"
      });
      return;
    }

    try {
      const text = await file.text();
      setHtmlContent(text);
      toast({
        title: "File loaded",
        description: `Loaded ${file.name} successfully`,
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

    try {
      const tokens = extractTokensFromHtml(htmlContent);
      
      if (tokens.length === 0) {
        toast({
          title: "No tokens found",
          description: "Could not extract any token addresses from the HTML",
          variant: "destructive"
        });
        setIsProcessing(false);
        return;
      }

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

      toast({
        title: "Success",
        description: `Extracted and saved ${tokens.length} token(s)`,
      });

      setHtmlContent("");
    } catch (error) {
      console.error('Error scraping HTML:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to process HTML",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
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
              accept=".html"
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
          <Textarea
            placeholder="Paste HTML content from DexScreener page here or upload an HTML file..."
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            className="min-h-[400px] font-mono text-xs"
          />
        </CardContent>
      </Card>
    </div>
  );
};
