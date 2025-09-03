import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TokenMetadataDisplay } from "./TokenMetadataDisplay";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

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
  const { tokenData, isLoading, error, fetchTokenMetadata, validateTokenAddress } = useTokenMetadata();
  const [validationState, setValidationState] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    const validateToken = async () => {
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

      setValidationState('validating');
      const isValid = await fetchTokenMetadata(value);
      setValidationState(isValid ? 'valid' : 'invalid');
      onValidationChange?.(isValid, tokenData);
    };

    const timeoutId = setTimeout(validateToken, 500);
    return () => clearTimeout(timeoutId);
  }, [value, validateTokenAddress, fetchTokenMetadata, onValidationChange, tokenData]);

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
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {tokenData && validationState === 'valid' && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Token Information</Label>
          <TokenMetadataDisplay 
            metadata={tokenData.metadata}
            priceInfo={tokenData.priceInfo}
            isLoading={isLoading}
            compact
          />
        </div>
      )}
    </div>
  );
}