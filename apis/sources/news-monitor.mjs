// NewsMonitor — curated public RSS/Atom feeds with simple event tagging.
// No auth required. Designed as a stable extension point for adding news sources
// without changing dashboard-specific rendering code.

const DEFAULT_FEEDS = [
  {
    url: 'https://www.theguardian.com/world/rss',
    source: 'Guardian World',
    region: 'Global',
    category: 'geopolitics',
  },
  {
    url: 'https://asia.nikkei.com/rss/feed/nar',
    source: 'Nikkei Asia',
    region: 'Asia',
    category: 'business',
  },
  {
    url: 'https://www.defensenews.com/arc/outboundfeeds/rss/category/global/?outputType=xml',
    source: 'Defense News',
    region: 'Global',
    category: 'defense',
  },
];

const CATEGORY_KEYWORDS = [
  ['geopolitics', ['war', 'conflict', 'military', 'missile', 'strike', 'sanction', 'border', 'nato', 'china', 'russia', 'iran', 'taiwan']],
  ['markets', ['market', 'stocks', 'bond', 'yield', 'inflation', 'rate', 'oil', 'gas', 'commodity', 'tariff']],
  ['supply_chain', ['shipping', 'port', 'supply chain', 'semiconductor', 'chip', 'export control', 'logistics']],
  ['cyber', ['cyber', 'hack', 'ransomware', 'breach', 'malware', 'outage']],
  ['health', ['outbreak', 'virus', 'disease', 'pandemic', 'vaccine', 'who']],
  ['climate_disaster', ['earthquake', 'flood', 'wildfire', 'storm', 'hurricane', 'drought', 'heatwave']],
  ['defense', ['defense', 'defence', 'weapon', 'drone', 'satellite', 'navy', 'air force', 'army']],
];

const URGENT_KEYWORDS = [
  'breaking', 'urgent', 'attack', 'missile', 'strike', 'explosion', 'invasion',
  'sanction', 'coup', 'earthquake', 'outage', 'ransomware', 'default',
  'blockade', 'evacuation', 'state of emergency',
];

function envFeeds() {
  return (process.env.NEWS_MONITOR_FEEDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      const [url, source = 'Custom News', region = 'Global', category = 'custom'] = value.split('|').map(part => part.trim());
      return { url, source, region, category };
    });
}

function decodeXml(text = '') {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
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

function parseFeed(xml, feed) {
  const items = [];
  const blocks = [];
  for (const re of [/<item\b[^>]*>([\s\S]*?)<\/item>/gi, /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi]) {
    let match;
    while ((match = re.exec(xml)) !== null) blocks.push(match[1]);
  }

  for (const block of blocks) {
    const title = getTag(block, 'title');
    const url = getLink(block);
    const summary = getTag(block, 'description') || getTag(block, 'summary') || getTag(block, 'content');
    const timestamp = getTag(block, 'pubDate') || getTag(block, 'published') || getTag(block, 'updated') || null;
    if (!title) continue;

    items.push({
      title,
      url,
      summary: summary ? summary.substring(0, 300) : '',
      timestamp,
      source: feed.source,
      region: feed.region,
      category: tagCategory(`${title} ${summary}`, feed.category),
      urgent: isUrgent(title),
    });
  }

  return items;
}

function tagCategory(text, fallback) {
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some(keyword => keywordMatches(text, keyword))) return category;
  }
  return fallback || 'general';
}

function isUrgent(text) {
  return URGENT_KEYWORDS.some(keyword => keywordMatches(text, keyword));
}

function keywordMatches(text, keyword) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = keyword.includes(' ')
    ? new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i')
    : new RegExp(`\\b${escaped}s?\\b`, 'i');
  return pattern.test(text);
}

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'Crucix/2.0 NewsMonitor' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return { feed, items: parseFeed(xml, feed) };
  } catch (err) {
    return { feed, error: err.message, items: [] };
  }
}

function uniqueRecent(items) {
  const seen = new Set();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const output = [];

  for (const item of items) {
    const key = `${item.source}|${item.title}`.toLowerCase().replace(/\s+/g, ' ').slice(0, 180);
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
  const byCategory = {};
  const bySource = {};
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }

  const urgentItems = items.filter(item => item.urgent).slice(0, 12);
  const signals = urgentItems.slice(0, 5).map(item => ({
    severity: 'medium',
    signal: `${item.source}: ${item.title}`,
    category: item.category,
    url: item.url,
  }));

  return {
    feedsQueried: results.length,
    feedsOk: results.filter(result => !result.error).length,
    feedsFailed: results.filter(result => result.error).length,
    byCategory,
    bySource,
    urgentCount: urgentItems.length,
    signals,
  };
}

export async function briefing() {
  const feeds = [...DEFAULT_FEEDS, ...envFeeds()];
  const results = await Promise.all(feeds.map(fetchFeed));
  const items = uniqueRecent(results.flatMap(result => result.items)).slice(0, 80);

  return {
    source: 'NewsMonitor',
    timestamp: new Date().toISOString(),
    feeds: results.map(result => ({
      source: result.feed.source,
      url: result.feed.url,
      status: result.error ? 'error' : 'ok',
      error: result.error || null,
      items: result.items.length,
    })),
    summary: summarize(items, results),
    items,
  };
}

if (process.argv[1]?.endsWith('news-monitor.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
