// LLM commentary for Taiwan coverage in foreign press.

const DEFAULT_LLM_TIMEOUT_MS = 300000;

function llmTimeoutMs() {
  return parseInt(
    process.env.LLM_TAIWAN_NEWS_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS,
    10,
  ) || DEFAULT_LLM_TIMEOUT_MS;
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

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter(tag => tag && typeof tag === 'object')
    .map(tag => ({
      type: ['warning', 'optimism', 'watch'].includes(tag.type) ? tag.type : 'watch',
      label: String(tag.label || tag.type || '觀察').slice(0, 12),
      severity: ['low', 'medium', 'high'].includes(tag.severity) ? tag.severity : 'medium',
      reason: String(tag.reason || '').slice(0, 80),
    }))
    .slice(0, 5);
}

function parseCommentaryResponse(text) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(extractJsonObject(text));
    const commentary = parsed.commentary || parsed.summary || parsed.analysis || '';
    if (!commentary) return null;
    return {
      source: 'llm',
      generatedAt: new Date().toISOString(),
      summary: String(commentary).slice(0, 900),
      tags: normalizeTags(parsed.tags),
      confidence: parsed.confidence || 'MEDIUM',
    };
  } catch {
    return null;
  }
}

function compactTaiwanNews(taiwanForeignNews = {}) {
  const items = (taiwanForeignNews.items || []).slice(0, 10).map(item => ({
    headline: item.headline || '',
    source: item.source || '',
    country: item.country || '',
    timestamp: item.timestamp || '',
    summary: item.summary || '',
    articleExcerpt: item.articleExcerpt || '',
    matchedKeywords: item.matchedKeywords || [],
    tags: item.tags || [],
  }));

  return JSON.stringify({
    summary: taiwanForeignNews.summary || {},
    ruleBasedCommentary: taiwanForeignNews.commentary || null,
    items,
  }, null, 2);
}

export async function generateTaiwanForeignNewsCommentary(provider, taiwanForeignNews) {
  if (!provider?.isConfigured) return null;
  if (!taiwanForeignNews?.items?.length) return null;

  const systemPrompt = `You are an OSINT media analyst writing for a Traditional Chinese dashboard.

Task:
- Read foreign-media headlines, RSS summaries, and crawled article excerpts about Taiwan.
- Produce a short Traditional Chinese integrated commentary.
- Mention the dominant narrative, what deserves attention, and what is still uncertain.
- Add tags when the sample shows over-optimism or abnormal warning signals.

Rules:
- Output ONLY valid JSON.
- Do not include markdown.
- Do not invent facts beyond the provided headlines, summaries, and excerpts.
- Keep commentary concise: 3-5 Chinese sentences.

Schema:
{
  "commentary": "繁體中文短文",
  "tags": [
    {"type": "warning|optimism|watch", "label": "異常警訊|過度樂觀|觀察", "severity": "low|medium|high", "reason": "short Traditional Chinese reason"}
  ],
  "confidence": "HIGH|MEDIUM|LOW"
}`;

  try {
    const result = await provider.complete(systemPrompt, compactTaiwanNews(taiwanForeignNews), {
      maxTokens: 1000,
      timeout: llmTimeoutMs(),
    });
    const parsed = parseCommentaryResponse(result.text);
    if (!parsed) {
      console.warn('[TaiwanForeignNews LLM] No valid commentary parsed');
      return null;
    }
    return {
      ...parsed,
      model: result.model || provider.model,
      headlineCount: taiwanForeignNews.items.length,
      articleFetchedCount: taiwanForeignNews.items.filter(item => item.articleFetched).length,
    };
  } catch (err) {
    console.error('[TaiwanForeignNews LLM] Generation failed:', err.message);
    return null;
  }
}
