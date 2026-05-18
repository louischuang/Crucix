// LLM-Powered Trade Ideas — generates actionable ideas from sweep data + delta context

const DEFAULT_LLM_TIMEOUT_MS = 300000;

function llmTimeoutMs() {
  return parseInt(process.env.LLM_IDEAS_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS, 10) || DEFAULT_LLM_TIMEOUT_MS;
}

function stripThinkingAndFences(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonArray(text) {
  const cleaned = stripThinkingAndFences(text);
  const start = cleaned.indexOf('[');
  if (start === -1) return cleaned;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (depth === 0) return cleaned.slice(start, i + 1);
  }
  return cleaned;
}

function extractJsonObject(text) {
  const cleaned = stripThinkingAndFences(text);
  const start = cleaned.indexOf('{');
  if (start === -1) return cleaned;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return cleaned.slice(start, i + 1);
  }
  return cleaned;
}

function firstValue(...values) {
  return values.find(value => value != null && String(value).trim() !== '');
}

function normalizeType(value, fallback = 'WATCH') {
  const raw = String(value || '').trim().toUpperCase();
  if (['LONG', 'SHORT', 'HEDGE', 'WATCH', 'AVOID'].includes(raw)) return raw;
  if (raw.includes('BUY') || raw.includes('ACCUMULATE') || raw.includes('OVERWEIGHT')) return 'LONG';
  if (raw.includes('SELL') || raw.includes('UNDERWEIGHT')) return 'SHORT';
  if (raw.includes('HEDGE')) return 'HEDGE';
  if (raw.includes('AVOID')) return 'AVOID';
  return fallback;
}

function normalizeConfidence(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (['HIGH', 'MEDIUM', 'LOW'].includes(raw)) return raw;
  if (raw.includes('HIGH') || raw.includes('STRONG')) return 'HIGH';
  if (raw.includes('LOW') || raw.includes('SPECULATIVE')) return 'LOW';
  return 'MEDIUM';
}

function normalizeSignals(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String).slice(0, 6);
  if (typeof value === 'string') {
    return value
      .split(/\n|;|\|/)
      .map(item => item.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6);
  }
  return [];
}

function parseJsonPayload(text) {
  const cleaned = stripThinkingAndFences(text);
  const candidates = cleaned.startsWith('[')
    ? [extractJsonArray(text), extractJsonObject(text), cleaned]
    : [extractJsonObject(text), extractJsonArray(text), cleaned];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next likely JSON envelope.
    }
  }
  return null;
}

function normalizeIdea(idea) {
  if (!idea || typeof idea !== 'object') return null;

  const title = firstValue(
    idea.title,
    idea.idea,
    idea.name,
    idea.trade,
    idea.thesisTitle,
    idea.recommendation
  );
  const rationale = firstValue(
    idea.rationale,
    idea.thesis,
    idea.reasoning,
    idea.explanation,
    idea.summary,
    idea.text
  );
  if (!title && !rationale) return null;

  return {
    title: String(title || rationale).trim(),
    type: normalizeType(firstValue(idea.type, idea.direction, idea.action, idea.stance)),
    ticker: String(firstValue(idea.ticker, idea.instrument, idea.symbol, idea.asset, idea.primaryInstrument) || '').trim(),
    confidence: normalizeConfidence(firstValue(idea.confidence, idea.conviction, idea.confidenceLevel)),
    rationale: String(rationale || '').trim(),
    risk: String(firstValue(idea.risk, idea.keyRisk, idea.riskFactor, idea.downside) || '').trim(),
    horizon: String(firstValue(idea.horizon, idea.timeHorizon, idea.timeframe, idea.duration) || '').trim(),
    signals: normalizeSignals(firstValue(idea.signals, idea.evidence, idea.dataPoints, idea.citations)),
    source: 'llm',
  };
}

/**
 * Generate LLM-enhanced trade ideas from sweep data.
 * @param {LLMProvider} provider - configured LLM provider
 * @param {object} sweepData - synthesized dashboard data
 * @param {object|null} delta - delta from last sweep
 * @param {Array} previousIdeas - ideas from previous runs (for dedup)
 * @returns {Promise<Array>} - array of idea objects
 */
export async function generateLLMIdeas(provider, sweepData, delta, previousIdeas = []) {
  if (!provider?.isConfigured) return null;

  let context;
  try {
    context = compactSweepForLLM(sweepData, delta, previousIdeas);
  } catch (err) {
    console.error('[LLM Ideas] Failed to compact sweep data:', err.message);
    return null;
  }

  const systemPrompt = `You are a quantitative analyst at a macro intelligence firm. You receive structured OSINT + economic data from 25 sources and produce 5-8 actionable trade ideas.

Rules:
- Each idea must cite specific data points from the input
- Include entry rationale, risk factors, and time horizon
- Blend geopolitical, economic, and market signals — cross-correlate across domains
- Be specific: name instruments (tickers, futures, ETFs), not vague sectors
- If delta shows significant changes, lead with those
- Do NOT repeat ideas from the "previous ideas" list unless conditions have materially changed
- Rate confidence: HIGH (multiple confirming signals), MEDIUM (thesis supported), LOW (speculative)
- Do not include markdown, prose, comments, or explanations outside the JSON

Output ONLY valid JSON array. Each object:
{
  "title": "Short title (max 10 words)",
  "type": "LONG|SHORT|HEDGE|WATCH|AVOID",
  "ticker": "Primary instrument",
  "confidence": "HIGH|MEDIUM|LOW",
  "rationale": "2-3 sentence explanation citing specific data",
  "risk": "Key risk factor",
  "horizon": "Intraday|Days|Weeks|Months",
  "signals": ["signal1", "signal2"]
}`;

  try {
    const result = await provider.complete(systemPrompt, context, { maxTokens: 4096, timeout: llmTimeoutMs() });
    const ideas = parseIdeasResponse(result.text);
    if (ideas && ideas.length > 0) {
      return ideas;
    }
    console.warn('[LLM Ideas] No valid ideas parsed from response:', String(result.text || '').slice(0, 500));
    return null;
  } catch (err) {
    console.error('[LLM Ideas] Generation failed:', err.message);
    return null;
  }
}

/**
 * Compact sweep data to ~8KB for token efficiency.
 */
export function compactSweepForLLM(data, delta, previousIdeas) {
  const sections = [];

  // Economic indicators
  if (data.fred?.length) {
    const key = data.fred.filter(f => ['VIXCLS', 'DFF', 'DGS10', 'DGS2', 'T10Y2Y', 'BAMLH0A0HYM2', 'DTWEXBGS', 'MORTGAGE30US'].includes(f.id));
    sections.push(`ECONOMIC: ${key.map(f => `${f.id}=${f.value}${f.momChange ? ` (${f.momChange > 0 ? '+' : ''}${f.momChange})` : ''}`).join(', ')}`);
  }

  // Energy
  if (data.energy) {
    sections.push(`ENERGY: WTI=$${data.energy.wti}, Brent=$${data.energy.brent}, NatGas=$${data.energy.natgas}, CrudeStocks=${data.energy.crudeStocks}bbl`);
  }

  // Metals
  if (data.metals?.gold != null || data.metals?.silver != null) {
    const gold = data.metals?.gold != null ? `$${data.metals.gold}` : 'n/a';
    const silver = data.metals?.silver != null ? `$${data.metals.silver}` : 'n/a';
    const goldChg = data.metals?.goldChangePct != null ? ` (${data.metals.goldChangePct >= 0 ? '+' : ''}${data.metals.goldChangePct}%)` : '';
    const silverChg = data.metals?.silverChangePct != null ? ` (${data.metals.silverChangePct >= 0 ? '+' : ''}${data.metals.silverChangePct}%)` : '';
    sections.push(`METALS: Gold=${gold}${goldChg}, Silver=${silver}${silverChg}`);
  }

  // BLS
  if (data.bls?.length) {
    sections.push(`LABOR: ${data.bls.map(b => `${b.id}=${b.value}`).join(', ')}`);
  }

  // Treasury
  if (data.treasury) {
    sections.push(`TREASURY: totalDebt=$${data.treasury}T`);
  }

  // Supply chain
  if (data.gscpi) {
    sections.push(`SUPPLY_CHAIN: GSCPI=${data.gscpi.value} (${data.gscpi.interpretation})`);
  }

  // Geopolitical signals (cap total OSINT text to ~1500 chars to keep prompt compact)
  const urgentPosts = (data.tg?.urgent || []).slice(0, 5);
  if (urgentPosts.length) {
    const MAX_OSINT_CHARS = 1500;
    let remaining = MAX_OSINT_CHARS;
    const lines = [];
    for (const p of urgentPosts) {
      const text = p.text || '';
      if (remaining <= 0) break;
      const trimmed = text.length > remaining ? text.substring(0, remaining) + '…' : text;
      lines.push(`- ${trimmed}`);
      remaining -= trimmed.length;
    }
    sections.push(`URGENT_OSINT:\n${lines.join('\n')}`);
  }

  // Thermal / fire detections
  if (data.thermal?.length) {
    const hotRegions = data.thermal.filter(t => t.det > 10).map(t => `${t.region}: ${t.det} detections (${t.hc} high-conf)`);
    if (hotRegions.length) sections.push(`THERMAL: ${hotRegions.join(', ')}`);
  }

  // Air activity
  if (data.air?.length) {
    const airSum = data.air.map(a => `${a.region}: ${a.total} aircraft`);
    sections.push(`AIR_ACTIVITY: ${airSum.join(', ')}`);
  }

  // Nuclear
  if (data.nuke?.length) {
    const anomalies = data.nuke.filter(n => n.anom);
    if (anomalies.length) sections.push(`NUCLEAR_ANOMALY: ${anomalies.map(n => `${n.site}: ${n.cpm}cpm`).join(', ')}`);
  }

  // WHO alerts
  if (data.who?.length) {
    sections.push(`WHO_ALERTS: ${data.who.slice(0, 3).map(w => w.title).join('; ')}`);
  }

  // Defense spending
  if (data.defense?.length) {
    const topContracts = data.defense.slice(0, 3).map(d => `$${((d.amount || 0) / 1e6).toFixed(0)}M to ${d.recipient}`);
    sections.push(`DEFENSE_CONTRACTS: ${topContracts.join(', ')}`);
  }

  // Delta context
  if (delta?.summary) {
    sections.push(`\nDELTA_SINCE_LAST_SWEEP: direction=${delta.summary.direction}, changes=${delta.summary.totalChanges}, critical=${delta.summary.criticalChanges}`);
    if (delta.signals?.escalated?.length) {
      sections.push(`ESCALATED: ${delta.signals.escalated.map(s => `${s.label}: ${s.previous}→${s.current} (${(s.changePct||0) > 0 ? '+' : ''}${(s.changePct||0).toFixed(1)}%)`).join(', ')}`);
    }
    if (delta.signals?.new?.length) {
      sections.push(`NEW_SIGNALS: ${delta.signals.new.map(s => s.label || s.text?.substring(0, 60)).join('; ')}`);
    }
  }

  // Previous ideas (for dedup)
  if (previousIdeas.length) {
    sections.push(`\nPREVIOUS_IDEAS (avoid repeating):\n${previousIdeas.map(i => `- ${i.title} [${i.type}]`).join('\n')}`);
  }

  return sections.join('\n');
}

/**
 * Parse LLM response into ideas array. Handles markdown code blocks, object
 * envelopes, and minor field-name drift from local models.
 */
export function parseIdeasResponse(text) {
  if (!text) return null;

  const parsed = parseJsonPayload(text);
  const ideas = Array.isArray(parsed)
    ? parsed
    : (
      parsed?.ideas ||
      parsed?.tradeIdeas ||
      parsed?.recommendations ||
      parsed?.actions ||
      parsed?.data ||
      (normalizeIdea(parsed) ? [parsed] : null)
    );

  if (!Array.isArray(ideas)) return null;

  const normalized = ideas
    .map(normalizeIdea)
    .filter(Boolean)
    .slice(0, 8);

  return normalized.length ? normalized : null;
}
