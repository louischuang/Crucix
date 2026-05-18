const DEFAULT_TRANSLATION_TIMEOUT_MS = 300000;

function translationTimeoutMs() {
  return parseInt(process.env.LLM_TRANSLATION_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS, 10) || DEFAULT_TRANSLATION_TIMEOUT_MS;
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

function trimText(text, max = 420) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function normalizeTranslations(parsed) {
  const zh = parsed?.zh && typeof parsed.zh === 'object' ? parsed.zh : {};
  const en = parsed?.en && typeof parsed.en === 'object' ? parsed.en : {};
  return {
    zh: {
      tSignals: Array.isArray(zh.tSignals) ? zh.tSignals : [],
      newsFeed: Array.isArray(zh.newsFeed) ? zh.newsFeed : [],
      tgUrgent: Array.isArray(zh.tgUrgent) ? zh.tgUrgent : [],
      ideas: Array.isArray(zh.ideas) ? zh.ideas : [],
      aiBrief: zh.aiBrief || null,
    },
    en: {
      tSignals: Array.isArray(en.tSignals) ? en.tSignals : [],
      newsFeed: Array.isArray(en.newsFeed) ? en.newsFeed : [],
      tgUrgent: Array.isArray(en.tgUrgent) ? en.tgUrgent : [],
      ideas: Array.isArray(en.ideas) ? en.ideas : [],
      aiBrief: en.aiBrief || null,
    },
  };
}

function buildTranslationPayload(data) {
  return {
    tSignals: (data.tSignals || []).slice(0, 12).map(text => trimText(text, 260)),
    newsFeed: (data.newsFeed || []).slice(0, 20).map(item => ({
      headline: trimText(item.headline, 220),
      source: item.source || '',
    })),
    tgUrgent: (data.tg?.urgent || []).slice(0, 15).map(item => ({
      text: trimText(item.text, 360),
      channel: item.channel || '',
    })),
    ideas: (data.ideas || []).slice(0, 8).map(item => ({
      title: trimText(item.title, 120),
      rationale: trimText(item.text || item.rationale, 420),
      risk: trimText(item.risk, 220),
      signals: (item.signals || []).slice(0, 3).map(signal => trimText(signal, 180)),
    })),
    aiBrief: data.aiBrief ? {
      executiveSummary: trimText(data.aiBrief.executiveSummary, 900),
      keyRisks: (data.aiBrief.keyRisks || []).slice(0, 4).map(item => trimText(item, 220)),
      marketImplications: (data.aiBrief.marketImplications || []).slice(0, 4).map(item => trimText(item, 220)),
      watchlist: (data.aiBrief.watchlist || []).slice(0, 4).map(item => trimText(item, 220)),
    } : null,
  };
}

export async function generateDashboardTranslations(provider, data) {
  if (!provider?.isConfigured) return null;

  const payload = buildTranslationPayload(data);
  const systemPrompt = `You are a bilingual intelligence dashboard translator.

Translate each supplied user-facing text into both English and Traditional Chinese.
Rules:
- If source text is English, keep the English version faithful and translate Traditional Chinese.
- If source text is Chinese, keep the Traditional Chinese version faithful and translate English.
- Preserve ticker symbols, proper nouns, source names, numbers, dates, measurements, and URLs exactly.
- Use concise Traditional Chinese suitable for Taiwan users.
- Output ONLY valid JSON matching the requested shape.`;

  const userMessage = `Translate this JSON payload. Return this exact shape:
{
  "en": {
    "tSignals": ["..."],
    "newsFeed": [{"headline": "..."}],
    "tgUrgent": [{"text": "..."}],
    "ideas": [{"title": "...", "rationale": "...", "risk": "...", "signals": ["..."]}],
    "aiBrief": {"executiveSummary": "...", "keyRisks": ["..."], "marketImplications": ["..."], "watchlist": ["..."]}
  },
  "zh": {
    "tSignals": ["..."],
    "newsFeed": [{"headline": "..."}],
    "tgUrgent": [{"text": "..."}],
    "ideas": [{"title": "...", "rationale": "...", "risk": "...", "signals": ["..."]}],
    "aiBrief": {"executiveSummary": "...", "keyRisks": ["..."], "marketImplications": ["..."], "watchlist": ["..."]}
  }
}

Payload:
${JSON.stringify(payload)}`;

  try {
    const result = await provider.complete(systemPrompt, userMessage, {
      maxTokens: 7000,
      timeout: translationTimeoutMs(),
    });
    const parsed = JSON.parse(extractJsonObject(result.text));
    const normalized = normalizeTranslations(parsed);
    return {
      ...normalized,
      source: 'llm',
      model: result.model || provider.model,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[LLM Translate] Translation failed:', err.message);
    return null;
  }
}
