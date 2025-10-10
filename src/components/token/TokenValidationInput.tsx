import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TokenMetadataDisplay } from "./TokenMetadataDisplay";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";

interface TokenValidationInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  onValidationChange?: (isValid: boolean, tokenData?: any) => void;
}

export function TokenValidationInput({ 
  value, 
  onChange, 
  label = "Token Address",
  placeholder = "Enter Solana token address",
  onValidationChange 
}: TokenValidationInputProps) {
  const { tokenData, isLoading, error, fetchTokenMetadata, refreshTokenMetadata, validateTokenAddress } = useTokenMetadata();
  const [validationState, setValidationState] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!value) {
      setValidationState('idle');
      onValidationChange?.(false);
      return;
    }

    if (!validateTokenAddress(value)) {
      setValidationState('invalid');
      onValidationChange?.(false);
      return;
    }

    // Prevent spam validation - only validate if token changed
    const currentToken = value.trim();
    if (tokenData?.metadata?.mint === currentToken && validationState === 'valid') {
      onValidationChange?.(true, tokenData);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setValidationState('validating');
      const isValid = await fetchTokenMetadata(currentToken);
      setValidationState(isValid ? 'valid' : 'invalid');
      onValidationChange?.(isValid, tokenData);
    }, 1000); // Increased debounce

    return () => clearTimeout(timeoutId);
  }, [value, validateTokenAddress, fetchTokenMetadata]);

  const getValidationIcon = () => {
    switch (validationState) {
      case 'validating':
        return <AlertCircle className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getInputClassName = () => {
    const base = "pr-10";
    switch (validationState) {
      case 'valid':
        return `${base} border-green-500 focus:border-green-500`;
      case 'invalid':
        return `${base} border-red-500 focus:border-red-500`;
      default:
        return base;
    }
  };

  const handleRefresh = async () => {
    if (!value || !validateTokenAddress(value) || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      const isValid = await refreshTokenMetadata(value);
      setValidationState(isValid ? 'valid' : 'invalid');
      onValidationChange?.(isValid, tokenData);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="token">{label}</Label>
        <div className="relative">
          <Input
            id="token"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={getInputClassName()}
          />
          {validationState !== 'idle' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {getValidationIcon()}
            </div>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            {value && validateTokenAddress(value) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="ml-2 h-6 text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Retry
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {tokenData && validationState === 'valid' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Token Information</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-6 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <TokenMetadataDisplay 
            metadata={tokenData.metadata}
            priceInfo={tokenData.priceInfo}
            onChainData={tokenData.onChainData}
            pools={tokenData.pools}
            isLoading={isLoading}
          />
        </div>
      )}
    </div>
  );
}