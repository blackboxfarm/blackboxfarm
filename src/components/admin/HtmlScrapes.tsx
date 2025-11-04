import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload } from "lucide-react";

export const HtmlScrapes = () => {
  const [htmlContent, setHtmlContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const extractTokensFromHtml = (html: string) => {
    const tokens: Array<{ mint: string; symbol?: string; name?: string }> = [];
    
    // Parse HTML and extract token data
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find all token rows - adjust selectors based on actual HTML structure
    const tokenElements = doc.querySelectorAll('[data-testid*="token"], .token-row, tr');
    
    tokenElements.forEach((element) => {
      const text = element.textContent || '';
      
      // Solana addresses are base58 encoded, 32-44 characters
      const addressMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
      
      if (addressMatch) {
        addressMatch.forEach(mint => {
          // Basic validation for Solana address format
          if (mint.length >= 32 && mint.length <= 44) {
            tokens.push({ mint });
          }
        });
      }
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
      const { data, error } = await supabase
        .from('scraped_tokens')
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
          <Textarea
            placeholder="Paste HTML content from DexScreener page here..."
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            className="min-h-[400px] font-mono text-xs"
          />
          <Button 
            onClick={handleScrape} 
            disabled={isProcessing || !htmlContent.trim()}
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            {isProcessing ? "Processing..." : "Extract & Save Tokens"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
