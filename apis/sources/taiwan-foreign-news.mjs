// TaiwanForeignNews — foreign media coverage mentioning Taiwan.
// Uses public RSS/Atom feeds only, keeps original article URLs, and filters
// for Taiwan-related keywords so the dashboard can show a focused ticker.

const DEFAULT_FEEDS = [
  { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', country: 'United Kingdom' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/AsiaPacific.xml', source: 'NYT Asia Pacific', country: 'United States' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', country: 'Qatar' },
  { url: 'https://rss.dw.com/rdf/rss-en-all', source: 'DW', country: 'Germany' },
  { url: 'https://www.france24.com/en/rss', source: 'France 24', country: 'France' },
  { url: 'https://www.euronews.com/rss?format=mrss', source: 'Euronews', country: 'Europe' },
  { url: 'https://www.theguardian.com/world/rss', source: 'Guardian World', country: 'United Kingdom' },
  { url: 'https://asia.nikkei.com/rss/feed/nar', source: 'Nikkei Asia', country: 'Japan' },
  { url: 'https://www.japantimes.co.jp/feed/', source: 'Japan Times', country: 'Japan' },
  { url: 'https://thediplomat.com/feed/', source: 'The Diplomat', country: 'United States' },
  { url: 'https://www.sbs.com.au/news/topic/world/feed', source: 'SBS World', country: 'Australia' },
];

const TAIWAN_KEYWORDS = [
  'taiwan', 'taipei', 'tsai ing-wen', 'lai ching-te', 'william lai',
  'taiwan strait', 'tsmc',
  'foxconn', 'hon hai', 'hualien', 'kaohsiung', 'kinmen',
  'people’s liberation army near taiwan', "people's liberation army near taiwan",
];

const WARNING_PATTERNS = [
  'drill', 'combat readiness', 'bullying', 'threatens', 'threat', 'arms',
  'invasion', 'blockade', 'coercion', 'war', 'missile', 'strait', 'pla',
  'excluded', 'political warfare', 'gray zone', 'grey zone', 'sanction',
  'military', 'naval', 'airspace',
];

const OPTIMISM_PATTERNS = [
  'trusts', 'approve arms sales', 'hopeful', 'optimistic', 'confidence',
  'breakthrough', 'rally', 'boost', 'record high', 'resilient', 'stabilize',
  'stabilise', 'opportunity',
];

function envFeeds() {
  return (process.env.TAIWAN_FOREIGN_NEWS_FEEDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      const [url, source = 'Foreign News', country = 'Global'] = value.split('|').map(part => part.trim());
      return { url, source, country };
    });
}

function decodeXml(text = '') {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(text = '') {
  return decodeXml(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function getTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function getLink(block) {
  const rssLink = getTag(block, 'link');
  if (rssLink) return rssLink;

  const atomLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return atomLink ? decodeXml(atomLink[1]) : '';
}

function keywordMatches(text, keyword) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = keyword.includes(' ')
    ? new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i')
    : new RegExp(`\\b${escaped}s?\\b`, 'i');
  return pattern.test(text);
}

function matchedKeywords(text) {
  return TAIWAN_KEYWORDS.filter(keyword => keywordMatches(text, keyword)).slice(0, 4);
}

function parseFeed(xml, feed) {
  const blocks = [];
  for (const re of [/<item\b[^>]*>([\s\S]*?)<\/item>/gi, /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi]) {
    let match;
    while ((match = re.exec(xml)) !== null) blocks.push(match[1]);
  }

  const items = [];
  for (const block of blocks) {
    const title = getTag(block, 'title');
    const url = getLink(block);
    const summary = getTag(block, 'description') || getTag(block, 'summary') || getTag(block, 'content');
    const timestamp = getTag(block, 'pubDate') || getTag(block, 'published') || getTag(block, 'updated') || null;
    const matched = matchedKeywords(`${title} ${summary}`);
    if (!title || !matched.length) continue;

    items.push({
      headline: title,
      source: feed.source,
      country: feed.country,
      type: 'taiwan-foreign-news',
      timestamp,
      url,
      summary: summary ? summary.substring(0, 280) : '',
      matchedKeywords: matched,
    });
  }
  return items;
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Crucix/2.0 TaiwanForeignNews' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return { feed, items: parseFeed(xml, feed) };
  } catch (err) {
    return { feed, error: err.message, items: [] };
  }
}

function extractArticleExcerpt(html = '') {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const source = articleMatch ? articleMatch[1] : html;
  const text = compactText(source
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<[^>]+>/g, ' '));
  return text.substring(0, 1400);
}

async function fetchArticleExcerpt(item) {
  if (!item.url || !/^https?:\/\//i.test(item.url)) return item;
  try {
    const res = await fetch(item.url, {
      headers: {
        'User-Agent': 'Crucix/2.0 TaiwanForeignNews (+https://github.com/louischuang/Crucix)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const articleExcerpt = extractArticleExcerpt(html);
    return {
      ...item,
      articleFetched: Boolean(articleExcerpt),
      articleExcerpt,
    };
  } catch (err) {
    return {
      ...item,
      articleFetched: false,
      articleError: err.message,
    };
  }
}

async function enrichArticles(items) {
  const limit = parseInt(process.env.TAIWAN_FOREIGN_NEWS_ARTICLE_LIMIT || '10', 10) || 10;
  const enriched = await Promise.all(items.slice(0, limit).map(fetchArticleExcerpt));
  return [
    ...enriched,
    ...items.slice(limit),
  ];
}

function includesPattern(text, patterns) {
  const source = String(text || '');
  return patterns.find(pattern => keywordMatches(source, pattern)) || '';
}

function tagItem(item) {
  // Article pages often include unrelated navigation headlines; keep tags tied
  // to the matched headline/RSS summary while commentary can use crawled text.
  const text = `${item.headline || ''} ${item.summary || ''}`;
  const tags = [];
  const warningHit = includesPattern(text, WARNING_PATTERNS);
  const optimismHit = includesPattern(text, OPTIMISM_PATTERNS);

  if (warningHit) {
    tags.push({
      type: 'warning',
      label: '異常警訊',
      severity: ['invasion', 'blockade', 'missile', 'war', 'combat readiness'].includes(warningHit) ? 'high' : 'medium',
      reason: `出現「${warningHit}」相關敘事`,
    });
  }
  if (optimismHit) {
    tags.push({
      type: 'optimism',
      label: '過度樂觀',
      severity: 'medium',
      reason: `出現「${optimismHit}」相關樂觀敘事`,
    });
  }

  return tags;
}

function uniqueTags(items) {
  const seen = new Set();
  const tags = [];
  for (const item of items) {
    for (const tag of item.tags || []) {
      const key = `${tag.type}|${tag.label}|${tag.reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags.slice(0, 5);
}

function buildRuleBasedCommentary(items, summary) {
  const topCountries = Object.entries(summary.byCountry || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([country, count]) => `${country} ${count}則`);
  const warningCount = items.filter(item => (item.tags || []).some(tag => tag.type === 'warning')).length;
  const optimismCount = items.filter(item => (item.tags || []).some(tag => tag.type === 'optimism')).length;
  const fetchedCount = items.filter(item => item.articleFetched).length;
  const headlineSample = items.slice(0, 4).map(item => `「${item.headline}」`).join('、');

  const summaryText = items.length
    ? [
      `目前外媒擷取到 ${items.length} 則與台灣相關的標題，主要來源分布在${topCountries.length ? topCountries.join('、') : '多個國家媒體'}。`,
      headlineSample ? `標題焦點包含 ${headlineSample}。` : '',
      fetchedCount ? `系統已讀取其中 ${fetchedCount} 則原文摘錄，綜合來看外媒同時關注台海安全、供應鏈與政治訊號。` : '目前原文頁面多數無法擷取，判讀以 RSS 標題與摘要為主。',
      warningCount ? `其中 ${warningCount} 則帶有軍事、脅迫或風險升高語彙，建議優先追蹤。` : '',
      optimismCount ? `另有 ${optimismCount} 則出現偏樂觀敘事，需留意是否低估政策或地緣風險。` : '',
    ].filter(Boolean).join('')
    : '目前尚未擷取到海外媒體中明確提及台灣的即時標題。';

  return {
    source: 'rule-based',
    generatedAt: new Date().toISOString(),
    headlineCount: items.length,
    articleFetchedCount: fetchedCount,
    summary: summaryText,
    tags: uniqueTags(items),
    confidence: fetchedCount ? 'MEDIUM' : 'LOW',
  };
}

function uniqueRecent(items) {
  const seen = new Set();
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const output = [];

  for (const item of items) {
    const key = `${item.source}|${item.headline}`.toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
    if (seen.has(key)) continue;
    seen.add(key);

    const time = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
    if (Number.isFinite(time) && time < cutoff) continue;
    output.push(item);
  }

  output.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return output;
}

function summarize(items, results) {
  const byCountry = {};
  const bySource = {};
  for (const item of items) {
    byCountry[item.country] = (byCountry[item.country] || 0) + 1;
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }
  return {
    feedsQueried: results.length,
    feedsOk: results.filter(result => !result.error).length,
    feedsFailed: results.filter(result => result.error).length,
    totalItems: items.length,
    byCountry,
    bySource,
  };
}

export async function briefing() {
  const feeds = [...DEFAULT_FEEDS, ...envFeeds()];
  const results = await Promise.all(feeds.map(fetchFeed));
  const rawItems = uniqueRecent(results.flatMap(result => result.items)).slice(0, 40);
  const items = (await enrichArticles(rawItems)).map(item => ({
    ...item,
    tags: tagItem(item),
  }));
  const summary = summarize(items, results);

  return {
    source: 'TaiwanForeignNews',
    timestamp: new Date().toISOString(),
    feeds: results.map(result => ({
      source: result.feed.source,
      country: result.feed.country,
      url: result.feed.url,
      status: result.error ? 'error' : 'ok',
      error: result.error || null,
      items: result.items.length,
    })),
    summary,
    commentary: buildRuleBasedCommentary(items, summary),
    items,
  };
}

if (process.argv[1]?.endsWith('taiwan-foreign-news.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
