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

function selectMapMarkers(markers = []) {
  const priority = ['air', 'maritime', 'nuke', 'osint', 'health', 'news', 'weather', 'space', 'conflict', 'thermal', 'gdelt', 'sdr', 'radiation'];
  const selected = [];
  for (const type of priority) {
    const perTypeLimit = ['thermal', 'sdr', 'news', 'gdelt'].includes(type) ? 4 : 8;
    for (const item of markers.filter(marker => marker.type === type).slice(0, perTypeLimit)) {
      selected.push(item);
      if (selected.length >= 24) return selected;
    }
  }
  return selected;
}

function normalizeTranslations(parsed) {
  const zh = parsed?.zh && typeof parsed.zh === 'object' ? parsed.zh : {};
  const en = parsed?.en && typeof parsed.en === 'object' ? parsed.en : {};
  return {
    zh: {
      tSignals: Array.isArray(zh.tSignals) ? zh.tSignals : [],
      newsFeed: Array.isArray(zh.newsFeed) ? zh.newsFeed : [],
      mapMarkers: Array.isArray(zh.mapMarkers) ? zh.mapMarkers : [],
      tgUrgent: Array.isArray(zh.tgUrgent) ? zh.tgUrgent : [],
      ideas: Array.isArray(zh.ideas) ? zh.ideas : [],
      aiBrief: zh.aiBrief || null,
    },
    en: {
      tSignals: Array.isArray(en.tSignals) ? en.tSignals : [],
      newsFeed: Array.isArray(en.newsFeed) ? en.newsFeed : [],
      mapMarkers: Array.isArray(en.mapMarkers) ? en.mapMarkers : [],
      tgUrgent: Array.isArray(en.tgUrgent) ? en.tgUrgent : [],
      ideas: Array.isArray(en.ideas) ? en.ideas : [],
      aiBrief: en.aiBrief || null,
    },
  };
}

function normalizeMapMarkerTranslations(parsed) {
  const zh = parsed?.zh && typeof parsed.zh === 'object' ? parsed.zh : {};
  const en = parsed?.en && typeof parsed.en === 'object' ? parsed.en : {};
  return {
    zh: Array.isArray(zh.mapMarkers) ? zh.mapMarkers : [],
    en: Array.isArray(en.mapMarkers) ? en.mapMarkers : [],
  };
}

function normalizeNewsTranslations(parsed) {
  const zh = parsed?.zh && typeof parsed.zh === 'object' ? parsed.zh : {};
  const en = parsed?.en && typeof parsed.en === 'object' ? parsed.en : {};
  return {
    zh: Array.isArray(zh.newsFeed) ? zh.newsFeed : [],
    en: Array.isArray(en.newsFeed) ? en.newsFeed : [],
  };
}

function buildTranslationPayload(data) {
  return {
    tSignals: (data.tSignals || []).slice(0, 12).map(text => trimText(text, 260)),
    newsFeed: (data.newsFeed || []).slice(0, 20).map(item => ({
      headline: trimText(item.headline, 220),
      source: item.source || '',
    })),
    mapMarkers: selectMapMarkers(data.mapMarkers || []).map(item => ({
      id: item.id,
      head: trimText(item.head, 90),
      text: trimText(item.text, 160),
      meta: trimText(item.meta, 90),
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

function buildNewsPrompt(newsFeed) {
  return {
    systemPrompt: `You are a bilingual news headline translator.

Translate news headlines into both English and Traditional Chinese.
Rules:
- Preserve source names, proper nouns, countries, people, numbers, dates, measurements, and ticker symbols.
- Use concise Traditional Chinese suitable for Taiwan users.
- Keep the same item order and output the same number of items.
- Output ONLY valid JSON.`,

    userMessage: `Translate this news headline JSON. Return this exact shape:
{
  "en": {"newsFeed": [{"headline": "..."}]},
  "zh": {"newsFeed": [{"headline": "..."}]}
}

News:
${JSON.stringify(newsFeed)}`,
  };
}

function buildMapMarkerPrompt(mapMarkers) {
  return {
    systemPrompt: `You are a bilingual map popup translator.

Translate short intelligence map popup fields into both English and Traditional Chinese.
Rules:
- Keep every id exactly unchanged.
- Preserve proper nouns, numbers, dates, measurements, source names, and ticker symbols exactly.
- Use concise Traditional Chinese suitable for Taiwan users.
- Output ONLY valid JSON.`,

    userMessage: `Translate this map marker JSON. Return this exact shape:
{
  "en": {"mapMarkers": [{"id": "...", "head": "...", "text": "...", "meta": "..."}]},
  "zh": {"mapMarkers": [{"id": "...", "head": "...", "text": "...", "meta": "..."}]}
}

Markers:
${JSON.stringify(mapMarkers)}`,
  };
}

function buildTranslationPrompt(payload) {
  return {
    systemPrompt: `You are a bilingual intelligence dashboard translator.

Translate each supplied user-facing text into both English and Traditional Chinese.
Rules:
- If source text is English, keep the English version faithful and translate Traditional Chinese.
- If source text is Chinese, keep the Traditional Chinese version faithful and translate English.
- Preserve ticker symbols, proper nouns, source names, numbers, dates, measurements, and URLs exactly.
- Use concise Traditional Chinese suitable for Taiwan users.
- Output ONLY valid JSON matching the requested shape.`,

    userMessage: `Translate this JSON payload. Return this exact shape:
{
  "en": {
    "tSignals": ["..."],
    "newsFeed": [{"headline": "..."}],
    "mapMarkers": [{"id": "...", "head": "...", "text": "...", "meta": "..."}],
    "tgUrgent": [{"text": "..."}],
    "ideas": [{"title": "...", "rationale": "...", "risk": "...", "signals": ["..."]}],
    "aiBrief": {"executiveSummary": "...", "keyRisks": ["..."], "marketImplications": ["..."], "watchlist": ["..."]}
  },
  "zh": {
    "tSignals": ["..."],
    "newsFeed": [{"headline": "..."}],
    "mapMarkers": [{"id": "...", "head": "...", "text": "...", "meta": "..."}],
    "tgUrgent": [{"text": "..."}],
    "ideas": [{"title": "...", "rationale": "...", "risk": "...", "signals": ["..."]}],
    "aiBrief": {"executiveSummary": "...", "keyRisks": ["..."], "marketImplications": ["..."], "watchlist": ["..."]}
  }
}

Payload:
${JSON.stringify(payload)}`,
  };
}

async function translatePayload(provider, payload) {
  const { systemPrompt, userMessage } = buildTranslationPrompt(payload);
  const result = await provider.complete(systemPrompt, userMessage, {
    maxTokens: 9000,
    timeout: translationTimeoutMs(),
  });
  const parsed = JSON.parse(extractJsonObject(result.text));
  return { normalized: normalizeTranslations(parsed), result };
}

async function translateMapMarkerBatch(provider, mapMarkers) {
  const { systemPrompt, userMessage } = buildMapMarkerPrompt(mapMarkers);
  const result = await provider.complete(systemPrompt, userMessage, {
    maxTokens: 2600,
    timeout: translationTimeoutMs(),
  });
  const parsed = JSON.parse(extractJsonObject(result.text));
  return normalizeMapMarkerTranslations(parsed);
}

async function translateNewsBatch(provider, newsFeed) {
  const { systemPrompt, userMessage } = buildNewsPrompt(newsFeed);
  const result = await provider.complete(systemPrompt, userMessage, {
    maxTokens: 1800,
    timeout: translationTimeoutMs(),
  });
  const parsed = JSON.parse(extractJsonObject(result.text));
  return normalizeNewsTranslations(parsed);
}

async function translateNewsFeed(provider, newsFeed) {
  const translated = { zh: [], en: [] };
  const batchSize = 5;
  for (let i = 0; i < newsFeed.length; i += batchSize) {
    const batch = newsFeed.slice(i, i + batchSize);
    try {
      const result = await translateNewsBatch(provider, batch);
      translated.zh.push(...result.zh);
      translated.en.push(...result.en);
    } catch (err) {
      console.error(`[LLM Translate] News batch ${i / batchSize + 1} failed:`, err.message);
      translated.zh.push(...batch.map(item => ({ headline: item.headline })));
      translated.en.push(...batch.map(item => ({ headline: item.headline })));
    }
  }
  return translated;
}

async function translateMapMarkers(provider, mapMarkers) {
  const translated = { zh: [], en: [] };
  const batchSize = 4;
  for (let i = 0; i < mapMarkers.length; i += batchSize) {
    const batch = mapMarkers.slice(i, i + batchSize);
    try {
      const result = await translateMapMarkerBatch(provider, batch);
      translated.zh.push(...result.zh);
      translated.en.push(...result.en);
    } catch (err) {
      console.error(`[LLM Translate] Map marker batch ${i / batchSize + 1} failed:`, err.message);
    }
  }
  return translated;
}

export async function generateDashboardTranslations(provider, data) {
  if (!provider?.isConfigured) return null;

  const payload = buildTranslationPayload(data);
  const corePayload = { ...payload, newsFeed: [], mapMarkers: [] };
  let normalized = normalizeTranslations({});
  let model = provider.model;
  let hasAnyTranslation = false;
  const newsFeed = payload.newsFeed?.length ? await translateNewsFeed(provider, payload.newsFeed) : null;
  if (newsFeed?.zh?.length || newsFeed?.en?.length) {
    hasAnyTranslation = true;
  }

  try {
    const result = await translatePayload(provider, corePayload);
    normalized = result.normalized;
    model = result.result.model || provider.model;
    hasAnyTranslation = true;
  } catch (err) {
    console.error('[LLM Translate] Core translation failed:', err.message);
  }

  const mapMarkers = payload.mapMarkers?.length ? await translateMapMarkers(provider, payload.mapMarkers) : null;
  if (newsFeed?.zh?.length || newsFeed?.en?.length || mapMarkers?.zh?.length || mapMarkers?.en?.length) {
    hasAnyTranslation = true;
  }

  if (!hasAnyTranslation) {
    return null;
  }

  return {
    ...normalized,
    zh: {
      ...normalized.zh,
      newsFeed: newsFeed?.zh || normalized.zh.newsFeed || [],
      mapMarkers: mapMarkers?.zh || normalized.zh.mapMarkers || [],
    },
    en: {
      ...normalized.en,
      newsFeed: newsFeed?.en || normalized.en.newsFeed || [],
      mapMarkers: mapMarkers?.en || normalized.en.mapMarkers || [],
    },
    source: 'llm',
    model,
    generatedAt: new Date().toISOString(),
  };
}
