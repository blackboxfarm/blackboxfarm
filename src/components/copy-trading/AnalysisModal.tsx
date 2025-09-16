import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

interface AnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  walletAddress: string
  isLoading: boolean
  requestData?: any
  responseData?: any
  error?: string
}

export function AnalysisModal({ 
  isOpen, 
  onClose, 
  walletAddress, 
  isLoading, 
  requestData, 
  responseData, 
  error 
}: AnalysisModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>24-Hour Analysis Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Wallet Address</h3>
            <code className="bg-muted p-2 rounded text-sm block">{walletAddress}</code>
          </div>

          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              Request Data
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            </h3>
            <ScrollArea className="h-32">
              <pre className="bg-muted p-3 rounded text-xs">
                {requestData ? JSON.stringify(requestData, null, 2) : 'No request data yet'}
              </pre>
            </ScrollArea>
          </div>

          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              Response Data
              {isLoading && <Badge variant="secondary">Analyzing...</Badge>}
            </h3>
            <ScrollArea className="h-64">
              <pre className="bg-muted p-3 rounded text-xs">
                {error ? (
                  <span className="text-destructive">{error}</span>
                ) : responseData ? (
                  JSON.stringify(responseData, null, 2)
                ) : isLoading ? (
                  'Waiting for response...'
                ) : (
                  'No response data yet'
                )}
              </pre>
            </ScrollArea>
          </div>

          {responseData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted p-3 rounded">
                <div className="text-sm text-muted-foreground">Transactions Found</div>
                <div className="text-lg font-semibold">{responseData.transactions_found || 0}</div>
              </div>
              <div className="bg-muted p-3 rounded">
                <div className="text-sm text-muted-foreground">Processed</div>
                <div className="text-lg font-semibold">{responseData.transactions_processed || 0}</div>
              </div>
              <div className="bg-muted p-3 rounded">
                <div className="text-sm text-muted-foreground">Errors</div>
                <div className="text-lg font-semibold">{responseData.error_count || 0}</div>
              </div>
              <div className="bg-muted p-3 rounded">
                <div className="text-sm text-muted-foreground">Copy Trades</div>
                <div className="text-lg font-semibold">{responseData.copy_trades_triggered || 0}</div>
              </div>
            </div>
          )}

          {responseData?.transactions && responseData.transactions.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Transaction Details</h3>
              <ScrollArea className="h-40">
                <div className="space-y-2">
                  {responseData.transactions.map((tx: any, index: number) => (
                    <div key={index} className="bg-muted p-2 rounded text-xs">
                      <div className="flex justify-between items-center mb-1">
                        <Badge variant={tx.transaction_type === 'buy' ? 'default' : 'secondary'}>
                          {tx.transaction_type}
                        </Badge>
                        <span className="font-mono">{tx.signature?.slice(0, 8)}...</span>
                      </div>
                      <div>Token: {tx.token_symbol} | Amount: ${tx.amount_usd?.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}