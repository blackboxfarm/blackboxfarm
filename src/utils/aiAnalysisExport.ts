// AI Analysis Export Utilities

interface AIKeyDriver {
  label: string;
  metric_value: string;
  bucket: string;
  implication: string;
}

interface AIReasoningStep {
  metric: string;
  value: string;
  threshold_category: string;
  phrase_selected: string;
}

interface AILifecycle {
  stage: string;
  confidence: string;
  explanation: string;
}

interface AIInterpretation {
  status_overview: string;
  lifecycle: AILifecycle;
  key_drivers: AIKeyDriver[];
  reasoning_trace: AIReasoningStep[];
  uncertainty_notes?: string[];
  abbreviated_summary: string;
}

interface MetricsContext {
  token_symbol?: string;
  token_name?: string;
  control_density?: { value: number; bucket: string };
  liquidity_coverage?: { value: number; bucket: string };
  resilience_score?: { value: number; bucket: string };
  tier_divergence?: { value: number; bucket: string };
  risk_flags?: string[];
  total_holders?: number;
  market_cap?: number;
}

interface AIInterpretationResponse {
  interpretation: AIInterpretation;
  mode: string;
  mode_label?: string;
  mode_reason?: string;
  cached: boolean;
  metrics_context?: MetricsContext;
}

export function formatAnalysisAsText(
  interpretation: AIInterpretationResponse,
  tokenMint: string,
  tone: string
): string {
  const { interpretation: interp, mode, mode_label, metrics_context } = interpretation;
  
  const lines: string[] = [];
  
  // Header
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    AI TOKEN ANALYSIS REPORT');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  
  // Token Info
  if (metrics_context?.token_symbol) {
    lines.push(`Token: $${metrics_context.token_symbol} (${metrics_context.token_name || 'Unknown'})`);
  }
  lines.push(`Address: ${tokenMint}`);
  lines.push(`Analysis Mode: ${mode} - ${mode_label || 'Snapshot'}`);
  lines.push(`Tone: ${tone.charAt(0).toUpperCase() + tone.slice(1)}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('');
  
  // Lifecycle
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('LIFECYCLE POSITION');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`Stage: ${interp.lifecycle.stage} (${interp.lifecycle.confidence} confidence)`);
  lines.push(`Explanation: ${interp.lifecycle.explanation}`);
  lines.push('');
  
  // Status Overview
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('STATUS OVERVIEW');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(interp.status_overview);
  lines.push('');
  
  // Key Drivers
  if (interp.key_drivers.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('KEY DRIVERS');
    lines.push('───────────────────────────────────────────────────────────────');
    interp.key_drivers.forEach((driver, i) => {
      lines.push(`${i + 1}. ${driver.label}`);
      lines.push(`   Value: ${driver.metric_value} → ${driver.bucket}`);
      lines.push(`   Implication: ${driver.implication}`);
      lines.push('');
    });
  }
  
  // Metrics Summary
  if (metrics_context) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('METRICS SUMMARY');
    lines.push('───────────────────────────────────────────────────────────────');
    if (metrics_context.total_holders) {
      lines.push(`Total Holders: ${metrics_context.total_holders.toLocaleString()}`);
    }
    if (metrics_context.control_density) {
      lines.push(`Control Density: ${metrics_context.control_density.bucket}`);
    }
    if (metrics_context.liquidity_coverage) {
      lines.push(`Liquidity Coverage: ${metrics_context.liquidity_coverage.bucket}`);
    }
    if (metrics_context.resilience_score) {
      lines.push(`Resilience: ${metrics_context.resilience_score.bucket}`);
    }
    if (metrics_context.risk_flags && metrics_context.risk_flags.length > 0) {
      lines.push(`Risk Flags: ${metrics_context.risk_flags.join(', ')}`);
    }
    lines.push('');
  }
  
  // Uncertainty Notes
  if (interp.uncertainty_notes && interp.uncertainty_notes.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('UNCERTAINTY NOTES');
    lines.push('───────────────────────────────────────────────────────────────');
    interp.uncertainty_notes.forEach(note => {
      lines.push(`⚠ ${note}`);
    });
    lines.push('');
  }
  
  // Summary
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push('TL;DR');
  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(interp.abbreviated_summary);
  lines.push('');
  
  // Footer
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('             Generated by Holders Intel AI Analysis');
  lines.push('             https://blackboxfarm.lovable.app/ai-analysis');
  lines.push('═══════════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

export function formatAnalysisAsHTML(
  interpretation: AIInterpretationResponse,
  tokenMint: string,
  tone: string
): string {
  const { interpretation: interp, mode, mode_label, metrics_context } = interpretation;
  
  const lifecycleColors: Record<string, string> = {
    Genesis: '#a855f7',
    Discovery: '#3b82f6',
    Expansion: '#22c55e',
    Distribution: '#eab308',
    Compression: '#f97316',
    Dormant: '#6b7280',
    Reactivation: '#06b6d4',
  };
  
  const stageColor = lifecycleColors[interp.lifecycle.stage] || '#6b7280';
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f0f; color: #e5e5e5; padding: 24px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 32px; }
    .header h1 { color: #a855f7; margin: 0; font-size: 24px; }
    .header .subtitle { color: #737373; font-size: 14px; margin-top: 8px; }
    .token-info { background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .token-info .symbol { font-size: 20px; font-weight: bold; color: #fff; }
    .token-info .address { font-family: monospace; font-size: 12px; color: #737373; word-break: break-all; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
    .lifecycle-badge { background: ${stageColor}20; color: ${stageColor}; border: 1px solid ${stageColor}40; }
    .section { background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 16px; }
    .section-title { font-size: 14px; font-weight: 600; color: #a855f7; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .overview { font-size: 16px; line-height: 1.6; color: #d4d4d4; }
    .driver { background: #262626; border-radius: 6px; padding: 12px; margin-bottom: 8px; }
    .driver-label { font-weight: 500; color: #fff; margin-bottom: 4px; }
    .driver-value { font-size: 12px; color: #a855f7; }
    .driver-implication { font-size: 13px; color: #a3a3a3; margin-top: 8px; }
    .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .metric { background: #262626; border-radius: 6px; padding: 12px; }
    .metric-label { font-size: 12px; color: #737373; }
    .metric-value { font-size: 14px; font-weight: 500; color: #fff; margin-top: 4px; }
    .summary { font-style: italic; color: #d4d4d4; border-left: 3px solid #a855f7; padding-left: 16px; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #525252; }
    .warning { background: #fbbf2420; border: 1px solid #fbbf2440; border-radius: 6px; padding: 12px; color: #fbbf24; font-size: 13px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🧠 AI Token Analysis</h1>
    <div class="subtitle">Generated ${new Date().toLocaleString()}</div>
  </div>

  <div class="token-info">
    <div class="symbol">${metrics_context?.token_symbol ? `$${metrics_context.token_symbol}` : 'Token'} ${metrics_context?.token_name ? `(${metrics_context.token_name})` : ''}</div>
    <div class="address">${tokenMint}</div>
    <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
      <span class="badge lifecycle-badge">${interp.lifecycle.stage}</span>
      <span class="badge" style="background: #3b82f620; color: #3b82f6; border: 1px solid #3b82f640;">Mode ${mode}: ${mode_label || 'Snapshot'}</span>
      <span class="badge" style="background: #52525220; color: #a3a3a3; border: 1px solid #52525240;">${tone.charAt(0).toUpperCase() + tone.slice(1)} Tone</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">📊 Status Overview</div>
    <div class="overview">${interp.status_overview}</div>
    <div style="margin-top: 12px; font-size: 13px; color: #a3a3a3; font-style: italic;">
      ${interp.lifecycle.explanation}
    </div>
  </div>

  ${interp.key_drivers.length > 0 ? `
  <div class="section">
    <div class="section-title">📈 Key Drivers</div>
    ${interp.key_drivers.map(driver => `
      <div class="driver">
        <div class="driver-label">${driver.label}</div>
        <div class="driver-value">${driver.metric_value} → ${driver.bucket}</div>
        <div class="driver-implication">${driver.implication}</div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${metrics_context ? `
  <div class="section">
    <div class="section-title">📋 Metrics Summary</div>
    <div class="metrics-grid">
      ${metrics_context.total_holders ? `<div class="metric"><div class="metric-label">Total Holders</div><div class="metric-value">${metrics_context.total_holders.toLocaleString()}</div></div>` : ''}
      ${metrics_context.control_density ? `<div class="metric"><div class="metric-label">Control Density</div><div class="metric-value">${metrics_context.control_density.bucket}</div></div>` : ''}
      ${metrics_context.liquidity_coverage ? `<div class="metric"><div class="metric-label">Liquidity Coverage</div><div class="metric-value">${metrics_context.liquidity_coverage.bucket}</div></div>` : ''}
      ${metrics_context.resilience_score ? `<div class="metric"><div class="metric-label">Resilience</div><div class="metric-value">${metrics_context.resilience_score.bucket}</div></div>` : ''}
    </div>
    ${metrics_context.risk_flags && metrics_context.risk_flags.length > 0 ? `
      <div style="margin-top: 12px;">
        <div class="metric-label" style="margin-bottom: 8px;">Risk Flags</div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          ${metrics_context.risk_flags.map(flag => `<span class="badge" style="background: #ef444420; color: #ef4444; border: 1px solid #ef444440;">${flag}</span>`).join('')}
        </div>
      </div>
    ` : ''}
  </div>
  ` : ''}

  ${interp.uncertainty_notes && interp.uncertainty_notes.length > 0 ? `
  <div class="section">
    <div class="section-title">⚠️ Uncertainty Notes</div>
    ${interp.uncertainty_notes.map(note => `<div class="warning">⚠ ${note}</div>`).join('')}
  </div>
  ` : ''}

  <div class="section">
    <div class="section-title">💡 TL;DR</div>
    <div class="summary">${interp.abbreviated_summary}</div>
  </div>

  <div class="footer">
    Generated by Holders Intel AI Analysis<br>
    <a href="https://blackboxfarm.lovable.app/ai-analysis" style="color: #a855f7;">blackboxfarm.lovable.app/ai-analysis</a>
  </div>
</body>
</html>
  `.trim();
}

export function copyToClipboard(text: string): Promise<boolean> {
  return navigator.clipboard.writeText(text)
    .then(() => true)
    .catch(() => false);
}

export function downloadAsFile(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
