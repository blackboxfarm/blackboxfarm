import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { supabase } from "@/integrations/supabase/client"
import { toast } from "sonner"

interface TokenMetrics {
  mint: string
  symbol: string
  name: string
  marketCap: number
  volume24h: number
  liquidityUsd: number
  priceUsd: number
  holderCount: number
  volatility24h: number
  ageHours: number
  spread: number
  liquidityLocked: boolean
  swingCount: number
  volumeProfile: number[]
  correlationScore: number
  newsScore: number
  totalScore: number
}

interface ScanResult {
  success: boolean
  tokens: TokenMetrics[]
  scannedCount: number
  qualifiedCount: number
  error?: string
}

interface CoinScannerProps {
  currentToken?: string
  onTokenSuggestion?: (token: TokenMetrics) => void
  autoScanEnabled?: boolean
  scanInterval?: number
}

export default function CoinScanner({ 
  currentToken, 
  onTokenSuggestion,
  autoScanEnabled = false,
  scanInterval = 300000 // 5 minutes default
}: CoinScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [autoScan, setAutoScan] = useState(autoScanEnabled)
  const [minScore, setMinScore] = useState([70])
  const [maxResults, setMaxResults] = useState([10])
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const [scanResults, setScanResults] = useState<TokenMetrics[]>([])
  const [scanStats, setScanStats] = useState({ scanned: 0, qualified: 0 })
  const [autoScanTimer, setAutoScanTimer] = useState<NodeJS.Timeout | null>(null)

  const performScan = useCallback(async () => {
    if (isScanning) return
    
    setIsScanning(true)
    console.log('Starting coin scan...')
    
    try {
      const { data, error } = await supabase.functions.invoke('coin-scanner', {
        body: {
          excludeMints: currentToken ? [currentToken] : [],
          minScore: minScore[0],
          limit: maxResults[0]
        }
      })
      
      if (error) throw error
      
      const result: ScanResult = data
      
      if (result.success) {
        setScanResults(result.tokens)
        setScanStats({
          scanned: result.scannedCount,
          qualified: result.qualifiedCount
        })
        setLastScan(new Date())
        
        // Auto-suggest top token if callback provided
        if (onTokenSuggestion && result.tokens.length > 0) {
          const topToken = result.tokens[0]
          if (topToken.totalScore > minScore[0] + 10) { // Only suggest if significantly better
            onTokenSuggestion(topToken)
          }
        }
        
        console.log(`Scan complete: ${result.tokens.length} tokens found`)
        toast.success(`Scan complete: ${result.tokens.length} qualified tokens found`)
      } else {
        throw new Error(result.error || 'Scan failed')
      }
      
    } catch (error) {
      console.error('Coin scan error:', error)
      toast.error(`Scan failed: ${error.message}`)
    } finally {
      setIsScanning(false)
    }
  }, [currentToken, minScore, maxResults, onTokenSuggestion])

  // Auto-scan effect
  useEffect(() => {
    if (autoScan) {
      // Immediate scan
      performScan()
      
      // Set up recurring scans
      const timer = setInterval(performScan, scanInterval)
      setAutoScanTimer(timer)
      
      return () => {
        clearInterval(timer)
        setAutoScanTimer(null)
      }
    } else {
      if (autoScanTimer) {
        clearInterval(autoScanTimer)
        setAutoScanTimer(null)
      }
    }
  }, [autoScan, scanInterval, performScan])

  const formatNumber = (num: number, decimals = 2) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(decimals)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(decimals)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(decimals)}K`
    return num.toFixed(decimals)
  }

  const formatDuration = (hours: number) => {
    if (hours < 24) return `${Math.round(hours)}h`
    if (hours < 168) return `${Math.round(hours / 24)}d`
    return `${Math.round(hours / 168)}w`
  }

  const getScoreColor = (score: number) => {
    if (score >= 85) return "bg-green-500"
    if (score >= 75) return "bg-yellow-500"
    return "bg-orange-500"
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Coin Scanner</span>
          <div className="flex items-center gap-2">
            <Badge variant={autoScan ? "default" : "secondary"}>
              {autoScan ? "Auto" : "Manual"}
            </Badge>
            {lastScan && (
              <span className="text-xs text-muted-foreground">
                Last: {lastScan.toLocaleTimeString()}
              </span>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Continuously scans for high-quality, volatile tokens with locked liquidity
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Auto Scan</label>
            <div className="flex items-center gap-2">
              <Switch
                checked={autoScan}
                onCheckedChange={setAutoScan}
              />
              <span className="text-xs text-muted-foreground">
                {autoScan ? `Every ${scanInterval / 60000}min` : "Disabled"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={performScan}
              disabled={isScanning}
              className="w-full"
            >
              {isScanning ? "Scanning..." : "Scan Now"}
            </Button>
          </div>
        </div>

        <Separator />

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Min Score: {minScore[0]}
            </label>
            <Slider
              value={minScore}
              onValueChange={setMinScore}
              min={50}
              max={95}
              step={5}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Max Results: {maxResults[0]}
            </label>
            <Slider
              value={maxResults}
              onValueChange={setMaxResults}
              min={5}
              max={25}
              step={5}
              className="w-full"
            />
          </div>
        </div>

        {/* Stats */}
        {scanStats.scanned > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Scanned: {scanStats.scanned} tokens</span>
            <span>Qualified: {scanStats.qualified} tokens</span>
            <span>Pass Rate: {((scanStats.qualified / scanStats.scanned) * 100).toFixed(1)}%</span>
          </div>
        )}

        <Separator />

        {/* Results */}
        <div className="space-y-3">
          <h4 className="font-medium">Qualified Tokens</h4>
          
          {scanResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isScanning ? "Scanning for tokens..." : "No qualified tokens found"}
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {scanResults.map((token, index) => (
                <Card key={token.mint} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h5 className="font-medium">{token.symbol}</h5>
                      <p className="text-xs text-muted-foreground truncate max-w-48">
                        {token.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getScoreColor(token.totalScore)}>
                        {token.totalScore.toFixed(0)}
                      </Badge>
                      {onTokenSuggestion && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onTokenSuggestion(token)}
                        >
                          Select
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">MC:</span> ${formatNumber(token.marketCap)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vol:</span> ${formatNumber(token.volume24h)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Liq:</span> ${formatNumber(token.liquidityUsd)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Holders:</span> {formatNumber(token.holderCount, 0)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vol:</span> {token.volatility24h.toFixed(1)}%
                    </div>
                    <div>
                      <span className="text-muted-foreground">Swings:</span> {token.swingCount}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Age:</span> {formatDuration(token.ageHours)}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Lock:</span>
                      <Badge variant={token.liquidityLocked ? "default" : "destructive"} className="text-xs">
                        {token.liquidityLocked ? "✓" : "✗"}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    Price: ${token.priceUsd.toFixed(6)} | Spread: {(token.spread * 100).toFixed(2)}%
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}