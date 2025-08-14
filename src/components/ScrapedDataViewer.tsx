import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export default function ScrapedDataViewer() {
  const [scrapedData, setScrapedData] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)

  const scrapeAndShow = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('https://dexscreener.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      const html = await response.text()
      setScrapedData(html)
    } catch (error) {
      setScrapedData(`Error scraping: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const extractTokensFromData = () => {
    if (!scrapedData) return []
    
    const tokens = []
    
    // Look for the pattern we see in the markdown
    const tokenPattern = /([A-Z0-9]+)\/SOL[\s\S]*?\$([0-9.]+)[\s\S]*?(\d+[dhm])[\s\S]*?([\d,]+)[\s\S]*?\$([0-9.]+[KMB]?)[\s\S]*?([\d,]+)[\s\S]*?(-?[0-9.]+%)[\s\S]*?(-?[0-9.]+%)[\s\S]*?(-?[0-9.]+%)[\s\S]*?(-?[0-9.]+%)/g
    
    let match
    while ((match = tokenPattern.exec(scrapedData)) !== null && tokens.length < 20) {
      tokens.push({
        symbol: match[1],
        price: match[2],
        age: match[3],
        txns: match[4],
        volume: match[5],
        makers: match[6],
        change5m: match[7],
        change1h: match[8],
        change6h: match[9],
        change24h: match[10]
      })
    }
    
    return tokens
  }

  const tokens = extractTokensFromData()

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Raw Scraped Data Viewer</CardTitle>
        <CardDescription>
          Let&apos;s see exactly what we&apos;re getting from dexscreener.com
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Button onClick={scrapeAndShow} disabled={isLoading} className="w-full">
          {isLoading ? "Scraping..." : "Scrape DexScreener Now"}
        </Button>

        {tokens.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">Extracted Tokens ({tokens.length})</h4>
            <div className="max-h-60 overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2 border-b">Symbol</th>
                    <th className="text-right p-2 border-b">Price</th>
                    <th className="text-right p-2 border-b">Volume</th>
                    <th className="text-right p-2 border-b">Txns</th>
                    <th className="text-right p-2 border-b">24h %</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token, index) => (
                    <tr key={index} className="hover:bg-muted/50">
                      <td className="p-2 border-b font-mono">{token.symbol}</td>
                      <td className="p-2 border-b text-right">${token.price}</td>
                      <td className="p-2 border-b text-right">${token.volume}</td>
                      <td className="p-2 border-b text-right">{token.txns}</td>
                      <td className={`p-2 border-b text-right ${parseFloat(token.change24h) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {token.change24h}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <Separator />

        {scrapedData && (
          <div className="space-y-3">
            <h4 className="font-medium">Raw HTML Content ({scrapedData.length} characters)</h4>
            <ScrollArea className="h-96 w-full border rounded-lg p-4">
              <pre className="text-xs whitespace-pre-wrap break-all">
                {scrapedData.substring(0, 10000)}...
              </pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}