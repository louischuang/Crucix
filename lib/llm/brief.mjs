// LLM-Powered AI Brief — concise executive summary from sweep data + ideas

import { compactSweepForLLM } from './ideas.mjs';

const DEFAULT_LLM_TIMEOUT_MS = 300000;

function llmTimeoutMs() {
  return parseInt(process.env.LLM_BRIEF_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS, 10) || DEFAULT_LLM_TIMEOUT_MS;
}

function stripThinkingAndFences(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
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

export async function generateLLMBrief(provider, sweepData, delta, ideas = []) {
  if (!provider?.isConfigured) return null;

  let context;
  try {
    context = compactSweepForLLM(sweepData, delta, ideas);
  } catch (err) {
    console.error('[LLM Brief] Failed to compact sweep data:', err.message);
    return null;
  }

  const ideaContext = ideas.length
    ? `\n\nTRADE_IDEAS:\n${ideas.map(i => `- ${i.type} ${i.ticker || ''}: ${i.title} (${i.confidence})`).join('\n')}`
    : '\n\nTRADE_IDEAS: none generated';

  const systemPrompt = `You are a macro intelligence briefer. Produce a concise AI brief from OSINT, economic, market, and delta data.

Rules:
- Be specific and cite concrete data points from the input.
- Separate facts from implications.
- Focus on what changed, what matters now, and what to watch next.
- Output ONLY valid JSON.
- Do not include markdown, prose, comments, or explanations outside the JSON.

Schema:
{
  "executiveSummary": "3-5 sentences",
  "keyRisks": ["risk 1", "risk 2", "risk 3"],
  "marketImplications": ["implication 1", "implication 2"],
  "watchlist": ["item 1", "item 2", "item 3"],
  "confidence": "HIGH|MEDIUM|LOW"
}`;

  try {
    const result = await provider.complete(systemPrompt, context + ideaContext, {
      maxTokens: 1600,
      timeout: llmTimeoutMs(),
    });
    const brief = parseBriefResponse(result.text);
    if (brief) return { ...brief, source: 'llm', model: result.model || provider.model };
    console.warn('[LLM Brief] No valid brief parsed from response');
    return null;
  } catch (err) {
    console.error('[LLM Brief] Generation failed:', err.message);
    return null;
  }
}

function parseBriefResponse(text) {
  if (!text) return null;

  const cleaned = extractJsonObject(text);

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || !parsed.executiveSummary) return null;
    return normalizeBrief(parsed);
  } catch {
    return null;
  }
}

function normalizeBrief(brief) {
  return {
    executiveSummary: String(brief.executiveSummary || ''),
    keyRisks: Array.isArray(brief.keyRisks) ? brief.keyRisks : [],
    marketImplications: Array.isArray(brief.marketImplications) ? brief.marketImplications : [],
    watchlist: Array.isArray(brief.watchlist) ? brief.watchlist : [],
    confidence: brief.confidence || 'MEDIUM',
  };
}
