/**
 * Telegram Input Sanitizer — Second-layer defense against injection attacks
 * via bot command inputs. Strips control characters, escape sequences,
 * excessively long inputs, and patterns commonly used in injection attempts.
 */

// Max lengths for different input types
const MAX_COMMAND_LENGTH = 64;
const MAX_ARGS_LENGTH = 512;
const MAX_TOTAL_LENGTH = 1024;

// Patterns that indicate injection attempts
const INJECTION_PATTERNS: RegExp[] = [
  // Shell injection
  /[;&|`$(){}[\]\\]/,
  // SQL injection keywords
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|UNION|OR\s+1\s*=\s*1|AND\s+1\s*=\s*1|--|;)\b/i,
  // Script injection
  /<script|javascript:|data:|vbscript:|on\w+\s*=/i,
  // Path traversal
  /\.\.\//,
  // Null bytes
  /\x00/,
  // Unicode direction overrides (used in spoofing)
  /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/,
  // ANSI escape sequences
  /\x1b\[/,
  // Telegram markdown injection (nested formatting abuse)
  /(\*{3,}|_{3,}|~{3,}|`{3,})/,
];

// Characters that should never appear in a Solana address or token mint
const SOLANA_ADDRESS_CLEAN = /^[1-9A-HJ-NP-Za-km-z]+$/;

export interface SanitizedInput {
  /** The cleaned command (lowercase, no bot mention suffix) */
  command: string;
  /** The cleaned arguments string */
  args: string;
  /** Individual cleaned argument tokens */
  argTokens: string[];
  /** Original raw text (truncated to MAX_TOTAL_LENGTH) */
  rawTruncated: string;
  /** Whether any suspicious patterns were detected */
  suspicious: boolean;
  /** List of triggered rules (for logging) */
  flags: string[];
}

/**
 * Strip invisible/control characters except standard whitespace
 */
function stripControlChars(input: string): string {
  // Keep only printable ASCII + standard Unicode letters/symbols + normal whitespace
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize a raw Telegram message text into safe command + args.
 */
export function sanitizeTelegramInput(rawText: string): SanitizedInput {
  const flags: string[] = [];
  let suspicious = false;

  // 1. Truncate to absolute max
  let text = rawText.length > MAX_TOTAL_LENGTH
    ? (flags.push('truncated'), rawText.slice(0, MAX_TOTAL_LENGTH))
    : rawText;

  // 2. Strip control characters
  const beforeControl = text;
  text = stripControlChars(text).trim();
  if (text !== beforeControl.trim()) {
    flags.push('control_chars_stripped');
    suspicious = true;
  }

  // 3. Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      flags.push(`injection_pattern:${pattern.source.slice(0, 30)}`);
      suspicious = true;
    }
  }

  // 4. Split into command + args
  const [rawCommand, ...argParts] = text.split(/\s+/);
  let command = (rawCommand || '').toLowerCase().replace(/@\w+$/, '');
  const argsRaw = argParts.join(' ');

  // 5. Enforce length limits
  if (command.length > MAX_COMMAND_LENGTH) {
    command = command.slice(0, MAX_COMMAND_LENGTH);
    flags.push('command_truncated');
    suspicious = true;
  }

  let args = argsRaw;
  if (args.length > MAX_ARGS_LENGTH) {
    args = args.slice(0, MAX_ARGS_LENGTH);
    flags.push('args_truncated');
  }

  // 6. Sanitize individual arg tokens
  const argTokens = args ? args.split(/\s+/).filter(Boolean) : [];

  return {
    command,
    args,
    argTokens,
    rawTruncated: text,
    suspicious,
    flags,
  };
}

/**
 * Validate that a string looks like a clean Solana address/mint.
 * Returns the address if valid, null otherwise.
 */
export function sanitizeSolanaAddress(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length < 32 || trimmed.length > 44) return null;
  if (!SOLANA_ADDRESS_CLEAN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Quick check: is this input safe enough to process, or should we
 * silently drop it? Returns false for extremely suspicious inputs.
 */
export function isInputSafeToProcess(sanitized: SanitizedInput): boolean {
  // If 3+ injection flags fired, this is almost certainly an attack
  const injectionFlags = sanitized.flags.filter(f => f.startsWith('injection_pattern:'));
  if (injectionFlags.length >= 3) return false;

  // Empty command after sanitization
  if (!sanitized.command) return false;

  return true;
}
