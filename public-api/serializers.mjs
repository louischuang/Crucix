const SUPPORTED_LANGS = new Set(['en', 'zh']);
const LANGUAGE_DEFS = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    direction: 'ltr',
    default: true,
  },
  {
    code: 'zh',
    name: 'Traditional Chinese',
    nativeName: '繁體中文',
    direction: 'ltr',
    default: false,
  },
];
const LOCALIZED_ENDPOINTS = ['/brief', '/ideas', '/news'];

export function normalizeLang(value) {
  return SUPPORTED_LANGS.has(value) ? value : 'en';
}

function compactText(value, max = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function translatedByIndex(data, lang, group, index, field, fallback) {
  const translated = data?.i18n?.[lang]?.[group]?.[index]?.[field];
  return translated || fallback || '';
}

function translatedArrayByIndex(data, lang, group, index, field, fallback = []) {
  const translated = data?.i18n?.[lang]?.[group]?.[index]?.[field];
  return Array.isArray(translated) && translated.length ? translated : fallback;
}

export function serializeMeta(data) {
  return {
    generatedAt: data?.meta?.timestamp || null,
    version: data?.meta?.version || null,
    sourcesQueried: data?.meta?.sourcesQueried || 0,
    sourcesOk: data?.meta?.sourcesOk || 0,
    sourcesFailed: data?.meta?.sourcesFailed || 0,
    totalDurationMs: data?.meta?.totalDurationMs || null,
    ideasSource: data?.ideasSource || 'unknown',
  };
}

export function serializeHealth(state) {
  const data = state.currentData;
  return {
    status: 'ok',
    service: 'crucix-public-api',
    uptime: Math.floor((Date.now() - state.startTime) / 1000),
    lastSweep: state.lastSweepTime,
    nextSweep: state.lastSweepTime
      ? new Date(new Date(state.lastSweepTime).getTime() + state.config.refreshIntervalMinutes * 60000).toISOString()
      : null,
    sweepInProgress: state.sweepInProgress,
    sweepStartedAt: state.sweepStartedAt,
    llmEnabled: !!state.config.llm.provider,
    llmProvider: state.config.llm.provider,
    language: state.currentLanguage,
    dataReady: !!data,
    sourcesOk: data?.meta?.sourcesOk || 0,
    sourcesFailed: data?.meta?.sourcesFailed || 0,
  };
}

export function serializeBrief(data, lang = 'en') {
  const language = normalizeLang(lang);
  const brief = data?.aiBrief;
  const localized = brief?.i18n?.[language] || data?.i18n?.[language]?.aiBrief || null;

  return {
    meta: serializeMeta(data),
    language,
    brief: brief ? {
      executiveSummary: compactText(localized?.executiveSummary || brief.executiveSummary),
      keyRisks: localized?.keyRisks || brief.keyRisks || [],
      marketImplications: localized?.marketImplications || brief.marketImplications || [],
      watchlist: localized?.watchlist || brief.watchlist || [],
      confidence: brief.confidence || null,
      source: brief.source || 'llm',
      generatedAt: brief.generatedAt || data?.meta?.timestamp || null,
    } : null,
  };
}

export function serializeIdeas(data, lang = 'en') {
  const language = normalizeLang(lang);
  return {
    meta: serializeMeta(data),
    language,
    ideas: (data?.ideas || []).map((idea, index) => ({
      id: `idea_${index + 1}`,
      title: translatedByIndex(data, language, 'ideas', index, 'title', idea.title),
      type: idea.type || null,
      ticker: idea.ticker || '',
      confidence: idea.confidence || null,
      rationale: translatedByIndex(data, language, 'ideas', index, 'rationale', idea.rationale || idea.text),
      risk: translatedByIndex(data, language, 'ideas', index, 'risk', idea.risk),
      horizon: idea.horizon || '',
      signals: translatedArrayByIndex(data, language, 'ideas', index, 'signals', idea.signals || []),
      source: idea.source || data?.ideasSource || 'unknown',
    })),
  };
}

export function serializeNews(data, lang = 'en') {
  const language = normalizeLang(lang);
  return {
    meta: serializeMeta(data),
    language,
    news: (data?.newsFeed || []).map((item, index) => ({
      id: `news_${index + 1}`,
      headline: translatedByIndex(data, language, 'newsFeed', index, 'headline', item.headline),
      source: item.source || '',
      type: item.type || 'unknown',
      timestamp: item.timestamp || null,
      region: item.region || '',
      urgent: !!item.urgent,
      url: item.url || null,
    })),
  };
}

export function serializeSources(data) {
  return {
    meta: serializeMeta(data),
    sources: {
      air: {
        liveTotal: data?.airMeta?.liveTotal || 0,
        source: data?.airMeta?.source || 'unknown',
        regions: (data?.air || []).map(region => ({
          name: region.region,
          total: region.total || 0,
          highAltitude: region.highAlt || 0,
          noCallsign: region.noCallsign || 0,
        })),
      },
      thermal: (data?.thermal || []).map(region => ({
        name: region.region,
        detections: region.det || 0,
        highConfidence: region.hc || 0,
        nightDetections: region.night || 0,
      })),
      nuclear: (data?.nuke || []).map(site => ({
        site: site.site,
        anomalous: !!site.anom,
        cpm: site.cpm ?? null,
        samples: site.n || 0,
      })),
      macro: {
        fred: (data?.fred || []).map(item => ({
          id: item.id,
          label: item.label,
          value: item.value,
          date: item.date,
        })),
        energy: data?.energy || null,
        metals: data?.metals || null,
      },
      osint: {
        telegramPosts: data?.tg?.posts || 0,
        urgentSignals: data?.tg?.urgent?.length || 0,
        newsItems: data?.newsFeed?.length || 0,
      },
    },
  };
}

export function serializeLocales(state) {
  return {
    current: state.currentLanguage,
    supported: ['en', 'zh'],
    query: 'Use ?lang=en or ?lang=zh on localized endpoints.',
  };
}

export function serializeLanguages(state) {
  const current = normalizeLang(state.currentLanguage);
  return {
    current,
    default: 'en',
    languages: LANGUAGE_DEFS.map(language => ({
      ...language,
      active: language.code === current,
    })),
    localizedEndpoints: LOCALIZED_ENDPOINTS,
    queryParameter: 'lang',
    examples: LOCALIZED_ENDPOINTS.flatMap(endpoint => (
      LANGUAGE_DEFS.map(language => `${endpoint}?lang=${language.code}`)
    )),
  };
}
