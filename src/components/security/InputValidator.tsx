import { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

interface ValidationRule {
  test: (value: string) => boolean;
  message: string;
  severity: 'error' | 'warning';
}

interface InputValidatorProps {
  value: string;
  rules: ValidationRule[];
  children: ReactNode;
  showValidation?: boolean;
}

export const InputValidator = ({ 
  value, 
  rules, 
  children, 
  showValidation = true 
}: InputValidatorProps) => {
  const validationResults = rules.map(rule => ({
    ...rule,
    passed: rule.test(value)
  }));

  const errors = validationResults.filter(result => 
    !result.passed && result.severity === 'error'
  );
  
  const warnings = validationResults.filter(result => 
    !result.passed && result.severity === 'warning'
  );

  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  return (
    <div className="space-y-2">
      {children}
      
      {showValidation && value && (hasErrors || hasWarnings) && (
        <div className="space-y-1">
          {errors.map((error, index) => (
            <Alert key={`error-${index}`} variant="destructive" className="py-2">
              <AlertTriangle className="h-3 w-3" />
              <AlertDescription className="text-xs">
                {error.message}
              </AlertDescription>
            </Alert>
          ))}
          
          {warnings.map((warning, index) => (
            <Alert key={`warning-${index}`} className="py-2 border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/10">
              <AlertTriangle className="h-3 w-3 text-yellow-600" />
              <AlertDescription className="text-xs text-yellow-700 dark:text-yellow-400">
                {warning.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
};

// Predefined validation rules
export const ValidationRules = {
  email: {
    test: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    message: 'Please enter a valid email address',
    severity: 'error' as const
  },
  
  password: {
    minLength: (min: number) => ({
      test: (value: string) => value.length >= min,
      message: `Password must be at least ${min} characters long`,
      severity: 'error' as const
    }),
    
    maxLength: (max: number) => ({
      test: (value: string) => value.length <= max,
      message: `Password must not exceed ${max} characters`,
      severity: 'error' as const
    }),
    
    hasUppercase: {
      test: (value: string) => /[A-Z]/.test(value),
      message: 'Password should contain at least one uppercase letter',
      severity: 'warning' as const
    },
    
    hasLowercase: {
      test: (value: string) => /[a-z]/.test(value),
      message: 'Password should contain at least one lowercase letter',
      severity: 'warning' as const
    },
    
    hasNumber: {
      test: (value: string) => /\d/.test(value),
      message: 'Password should contain at least one number',
      severity: 'warning' as const
    },
    
    hasSpecialChar: {
      test: (value: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value),
      message: 'Password should contain at least one special character',
      severity: 'warning' as const
    }
  },
  
  url: {
    test: (value: string) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message: 'Please enter a valid URL',
    severity: 'error' as const
  },
  
  httpsUrl: {
    test: (value: string) => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:';
      } catch {
        return false;
      }
    },
    message: 'URL should use HTTPS for security',
    severity: 'warning' as const
  },
  
  solanaAddress: {
    test: (value: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value),
    message: 'Please enter a valid Solana address',
    severity: 'error' as const
  },
  
  solanaPrivateKey: {
    test: (value: string) => {
      // Basic validation - should be base58 or JSON array
      const trimmed = value.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) && parsed.length === 64;
        } catch {
          return false;
        }
      }
      return /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(trimmed);
    },
    message: 'Private key must be a valid base58 string or JSON array',
    severity: 'error' as const
  },
  
  required: {
    test: (value: string) => value.trim().length > 0,
    message: 'This field is required',
    severity: 'error' as const
  },
  
  noWhitespace: {
    test: (value: string) => !value.includes(' '),
    message: 'This field should not contain spaces',
    severity: 'error' as const
  }
};