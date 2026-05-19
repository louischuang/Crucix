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
  const priority = ['osint', 'air', 'maritime', 'nuke', 'conflict', 'thermal', 'weather', 'space', 'health', 'gdelt', 'sdr', 'radiation'];
  const selected = [];
  const seen = new Set();
  const add = item => {
    if (!item?.id || seen.has(item.id)) return false;
    selected.push(item);
    seen.add(item.id);
    return selected.length >= 36;
  };

  for (const type of priority) {
    const perTypeLimit = ['thermal', 'sdr', 'gdelt'].includes(type) ? 3 : 4;
    for (const item of markers.filter(marker => marker.type === type).slice(0, perTypeLimit)) {
      if (add(item)) return selected;
    }
  }

  for (const item of markers) {
    if (add(item)) return selected;
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

function normalizeTextListTranslations(parsed, key) {
  const zh = parsed?.zh && typeof parsed.zh === 'object' ? parsed.zh : {};
  const en = parsed?.en && typeof parsed.en === 'object' ? parsed.en : {};
  return {
    zh: Array.isArray(zh[key]) ? zh[key] : [],
    en: Array.isArray(en[key]) ? en[key] : [],
  };
}

function normalizeIdeasTranslations(parsed) {
  const zh = parsed?.zh && typeof parsed.zh === 'object' ? parsed.zh : {};
  const en = parsed?.en && typeof parsed.en === 'object' ? parsed.en : {};
  return {
    zh: Array.isArray(zh.ideas) ? zh.ideas : [],
    en: Array.isArray(en.ideas) ? en.ideas : [],
  };
}

function normalizeBriefTranslations(parsed) {
  const zh = parsed?.zh && typeof parsed.zh === 'object' ? parsed.zh : {};
  const en = parsed?.en && typeof parsed.en === 'object' ? parsed.en : {};
  return {
    zh: zh.aiBrief || null,
    en: en.aiBrief || null,
  };
}

function buildTranslationPayload(data) {
  return {
    tSignals: (data.tSignals || []).slice(0, 12).map(text => trimText(text, 260)),
    newsFeed: (data.newsFeed || []).slice(0, 50).map(item => ({
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

function buildTextListPrompt(key, items, label) {
  return {
    systemPrompt: `You are a bilingual intelligence dashboard translator.

Translate short ${label} into both English and Traditional Chinese.
Rules:
- Preserve proper nouns, countries, source names, numbers, dates, measurements, ticker symbols, and URLs exactly.
- Use concise Traditional Chinese suitable for Taiwan users.
- Keep the same item order and output the same number of items.
- Output ONLY valid JSON.`,

    userMessage: `Translate this JSON array. Return this exact shape:
{
  "en": {"${key}": ["..."]},
  "zh": {"${key}": ["..."]}
}

Items:
${JSON.stringify(items)}`,
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

function buildIdeasPrompt(ideas) {
  return {
    systemPrompt: `You are a bilingual investment intelligence translator.

Translate actionable idea fields into both English and Traditional Chinese.
Rules:
- Preserve ticker symbols, asset classes, countries, people, numbers, dates, measurements, and source names exactly.
- Use concise Traditional Chinese suitable for Taiwan users.
- Keep the same item order and output the same number of items.
- Output ONLY valid JSON.`,

    userMessage: `Translate this ideas JSON. Return this exact shape:
{
  "en": {"ideas": [{"title": "...", "rationale": "...", "risk": "...", "signals": ["..."]}]},
  "zh": {"ideas": [{"title": "...", "rationale": "...", "risk": "...", "signals": ["..."]}]}
}

Ideas:
${JSON.stringify(ideas)}`,
  };
}

function buildBriefPrompt(aiBrief) {
  return {
    systemPrompt: `You are a bilingual executive intelligence brief translator.

Translate the AI brief into both English and Traditional Chinese.
Rules:
- Preserve proper nouns, countries, people, numbers, dates, measurements, ticker symbols, and source names exactly.
- Use concise Traditional Chinese suitable for Taiwan users.
- Output ONLY valid JSON.`,

    userMessage: `Translate this AI brief JSON. Return this exact shape:
{
  "en": {"aiBrief": {"executiveSummary": "...", "keyRisks": ["..."], "marketImplications": ["..."], "watchlist": ["..."]}},
  "zh": {"aiBrief": {"executiveSummary": "...", "keyRisks": ["..."], "marketImplications": ["..."], "watchlist": ["..."]}}
}

AI brief:
${JSON.stringify(aiBrief)}`,
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

async function translateTextListBatch(provider, key, items, label) {
  const { systemPrompt, userMessage } = buildTextListPrompt(key, items, label);
  const result = await provider.complete(systemPrompt, userMessage, {
    maxTokens: 2400,
    timeout: translationTimeoutMs(),
  });
  const parsed = JSON.parse(extractJsonObject(result.text));
  return normalizeTextListTranslations(parsed, key);
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

async function translateIdeasBatch(provider, ideas) {
  const { systemPrompt, userMessage } = buildIdeasPrompt(ideas);
  const result = await provider.complete(systemPrompt, userMessage, {
    maxTokens: 2800,
    timeout: translationTimeoutMs(),
  });
  const parsed = JSON.parse(extractJsonObject(result.text));
  return normalizeIdeasTranslations(parsed);
}

async function translateBrief(provider, aiBrief) {
  const { systemPrompt, userMessage } = buildBriefPrompt(aiBrief);
  const result = await provider.complete(systemPrompt, userMessage, {
    maxTokens: 3000,
    timeout: translationTimeoutMs(),
  });
  const parsed = JSON.parse(extractJsonObject(result.text));
  return normalizeBriefTranslations(parsed);
}

async function translateTextList(provider, key, items, label, batchSize = 6) {
  const translated = { zh: [], en: [] };
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const result = await translateTextListBatch(provider, key, batch, label);
      translated.zh.push(...result.zh);
      translated.en.push(...result.en);
    } catch (err) {
      console.error(`[LLM Translate] ${label} batch ${i / batchSize + 1} failed:`, err.message);
      translated.zh.push(...batch.map(() => null));
      translated.en.push(...batch.map(() => null));
    }
  }
  return translated;
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
      translated.zh.push(...batch.map(() => null));
      translated.en.push(...batch.map(() => null));
    }
  }
  return translated;
}

async function translateIdeas(provider, ideas) {
  const translated = { zh: [], en: [] };
  const batchSize = 2;
  for (let i = 0; i < ideas.length; i += batchSize) {
    const batch = ideas.slice(i, i + batchSize);
    try {
      const result = await translateIdeasBatch(provider, batch);
      translated.zh.push(...result.zh);
      translated.en.push(...result.en);
    } catch (err) {
      console.error(`[LLM Translate] Ideas batch ${i / batchSize + 1} failed:`, err.message);
      translated.zh.push(...batch.map(() => null));
      translated.en.push(...batch.map(() => null));
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

function countValid(items, field) {
  return (items || []).filter(item => field ? item?.[field] : item).length;
}

function isCompleteTranslation(payload, translations) {
  const zh = translations.zh || {};
  const en = translations.en || {};
  const required = [
    ['tSignals', payload.tSignals?.length || 0, countValid(zh.tSignals), countValid(en.tSignals)],
    ['newsFeed', payload.newsFeed?.length || 0, countValid(zh.newsFeed, 'headline'), countValid(en.newsFeed, 'headline')],
    ['tgUrgent', payload.tgUrgent?.length || 0, countValid(zh.tgUrgent, 'text'), countValid(en.tgUrgent, 'text')],
    ['ideas', payload.ideas?.length || 0, countValid(zh.ideas, 'title'), countValid(en.ideas, 'title')],
  ];
  for (const [name, expected, zhCount, enCount] of required) {
    if (expected > 0 && (zhCount < expected || enCount < expected)) {
      console.error(`[LLM Translate] Incomplete ${name} translation: zh=${zhCount}/${expected} en=${enCount}/${expected}`);
      return false;
    }
  }

  if (payload.aiBrief && (!zh.aiBrief?.executiveSummary || !en.aiBrief?.executiveSummary)) {
    console.error('[LLM Translate] Incomplete AI brief translation');
    return false;
  }

  return true;
}

function normalizeLookupText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function translatedNewsMapMarkers(mapMarkers, originalNewsFeed, newsFeed) {
  const translated = { zh: [], en: [] };
  const zhFeed = newsFeed?.zh || [];
  const enFeed = newsFeed?.en || [];
  const zhByHeadline = new Map();
  const enByHeadline = new Map();
  (originalNewsFeed || []).forEach((item, index) => {
    const key = normalizeLookupText(item.headline);
    if (!key) return;
    if (zhFeed[index]?.headline) zhByHeadline.set(key, zhFeed[index].headline);
    if (enFeed[index]?.headline) enByHeadline.set(key, enFeed[index].headline);
  });

  for (const marker of mapMarkers.filter(item => item.type === 'news')) {
    const index = Number(String(marker.id || '').replace(/^news-/, ''));
    if (!Number.isInteger(index)) continue;
    const key = normalizeLookupText(marker.text);
    const zhHeadline = zhByHeadline.get(key) || zhFeed[index]?.headline;
    const enHeadline = enByHeadline.get(key) || enFeed[index]?.headline;
    translated.zh.push({
      id: marker.id,
      head: marker.head,
      text: zhHeadline || marker.text,
      meta: marker.meta,
    });
    translated.en.push({
      id: marker.id,
      head: marker.head,
      text: enHeadline || marker.text,
      meta: marker.meta,
    });
  }
  return translated;
}

export async function generateDashboardTranslations(provider, data) {
  if (!provider?.isConfigured) return null;

  const payload = buildTranslationPayload(data);
  let normalized = normalizeTranslations({});
  let model = provider.model;

  const tSignals = payload.tSignals?.length
    ? await translateTextList(provider, 'tSignals', payload.tSignals, 'signal explanations', 6)
    : null;
  const newsFeed = payload.newsFeed?.length ? await translateNewsFeed(provider, payload.newsFeed) : null;
  const tgUrgent = payload.tgUrgent?.length
    ? await translateTextList(provider, 'tgUrgent', payload.tgUrgent.map(item => item.text), 'urgent OSINT posts', 5)
    : null;
  const ideas = payload.ideas?.length ? await translateIdeas(provider, payload.ideas) : null;
  const aiBrief = payload.aiBrief ? await translateBrief(provider, payload.aiBrief).catch(err => {
    console.error('[LLM Translate] AI brief translation failed:', err.message);
    return null;
  }) : null;
  const mapMarkers = payload.mapMarkers?.length ? await translateMapMarkers(provider, payload.mapMarkers) : null;
  const newsMapMarkers = translatedNewsMapMarkers(data.mapMarkers || [], payload.newsFeed || [], newsFeed);

  normalized = {
    zh: {
      tSignals: tSignals?.zh || [],
      newsFeed: newsFeed?.zh || [],
      mapMarkers: [...(newsMapMarkers.zh || []), ...(mapMarkers?.zh || [])],
      tgUrgent: (tgUrgent?.zh || []).map(text => ({ text })),
      ideas: ideas?.zh || [],
      aiBrief: aiBrief?.zh || null,
    },
    en: {
      tSignals: tSignals?.en || [],
      newsFeed: newsFeed?.en || [],
      mapMarkers: [...(newsMapMarkers.en || []), ...(mapMarkers?.en || [])],
      tgUrgent: (tgUrgent?.en || []).map(text => ({ text })),
      ideas: ideas?.en || [],
      aiBrief: aiBrief?.en || null,
    },
  };

  if (!isCompleteTranslation(payload, normalized)) {
    return null;
  }

  return {
    ...normalized,
    source: 'llm',
    model,
    generatedAt: new Date().toISOString(),
  };
}
