// OfficialMonitor — official policy, sanctions, and export-control updates.
// No auth required. Uses official government / EU endpoints where possible.

const TREASURY_PRESS_URL = 'https://home.treasury.gov/news/press-releases';
const EU_SANCTIONS_RSS_URL = 'https://finance.ec.europa.eu/node/1296/rss_en';
const FEDERAL_REGISTER_API = 'https://www.federalregister.gov/api/v1/documents.json';

const FEDERAL_REGISTER_TERMS = [
  '"Entity List"',
  '"Export Administration Regulations"',
  '"Bureau of Industry and Security"',
  '"OFAC Sanctions Action"',
];

const FEDERAL_REGISTER_RELEVANCE = [
  'entity list', 'unverified list', 'export administration regulations',
  'bureau of industry and security', 'ofac sanctions action',
  'department of state sanctions action', 'export control',
  'emerging technology technical advisory',
];

const URGENT_KEYWORDS = [
  'sanction', 'designat', 'entity list', 'export control', 'restriction',
  'iran', 'russia', 'china', 'north korea', 'terror', 'money laundering',
  'weapon', 'uav', 'drone', 'cyber',
];

function decodeText(text = '') {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeText(match[1]) : '';
}

function tagCategory(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('entity list') || value.includes('export administration') || value.includes('export control')) return 'export_controls';
  if (value.includes('sanction') || value.includes('restrictive measure')) return 'sanctions';
  if (value.includes('treasury') || value.includes('financial')) return 'financial_policy';
  return 'official_notice';
}

function isUrgent(text) {
  const value = String(text || '').toLowerCase();
  return URGENT_KEYWORDS.some(keyword => value.includes(keyword));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Crucix/2.0 OfficialMonitor' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Crucix/2.0 OfficialMonitor' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseTreasuryPress(html) {
  const items = [];
  const seen = new Set();
  const linkRe = /href=["'](\/news\/press-releases\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRe.exec(html)) !== null) {
    const url = `https://home.treasury.gov${match[1]}`;
    const title = decodeText(match[2]);
    if (!title || seen.has(url)) continue;
    seen.add(url);
    items.push({
      title,
      url,
      summary: '',
      timestamp: null,
      source: 'US Treasury Press Releases',
      region: 'United States',
      category: tagCategory(title),
      urgent: isUrgent(title),
    });
    if (items.length >= 20) break;
  }
  return items;
}

function parseRss(xml, source, region, fallbackCategory) {
  const items = [];
  const blocks = [];
  for (const re of [/<item\b[^>]*>([\s\S]*?)<\/item>/gi, /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi]) {
    let match;
    while ((match = re.exec(xml)) !== null) blocks.push(match[1]);
  }

  for (const block of blocks) {
    const title = getTag(block, 'title');
    const url = getTag(block, 'link') || getTag(block, 'guid') || getTag(block, 'id');
    const summary = getTag(block, 'description') || getTag(block, 'summary');
    const timestamp = getTag(block, 'pubDate') || getTag(block, 'published') || getTag(block, 'updated') || null;
    if (!title) continue;
    items.push({
      title,
      url,
      summary: summary.substring(0, 300),
      timestamp,
      source,
      region,
      category: tagCategory(`${title} ${summary}`) || fallbackCategory,
      urgent: isUrgent(`${title} ${summary}`),
    });
  }
  return items;
}

async function fetchTreasuryPress() {
  const html = await fetchText(TREASURY_PRESS_URL);
  return parseTreasuryPress(html);
}

async function fetchEuSanctions() {
  const xml = await fetchText(EU_SANCTIONS_RSS_URL);
  return parseRss(xml, 'European Commission Sanctions Guidance', 'European Union', 'sanctions');
}

async function fetchFederalRegister() {
  const all = [];
  for (const term of FEDERAL_REGISTER_TERMS) {
    const url = new URL(FEDERAL_REGISTER_API);
    url.searchParams.set('per_page', '10');
    url.searchParams.set('order', 'newest');
    url.searchParams.set('conditions[term]', term);
    const data = await fetchJson(url);
    for (const item of data.results || []) {
      const title = decodeText(item.title);
      const text = `${title} ${item.abstract || ''}`.toLowerCase();
      if (!FEDERAL_REGISTER_RELEVANCE.some(keyword => text.includes(keyword))) continue;
      all.push({
        title,
        url: item.html_url,
        summary: decodeText(item.abstract || '').substring(0, 300),
        timestamp: item.publication_date || null,
        source: 'Federal Register',
        region: 'United States',
        category: tagCategory(`${title} ${item.abstract || ''}`),
        urgent: isUrgent(`${title} ${item.abstract || ''}`),
      });
    }
  }
  return all;
}

function uniqueRecent(items) {
  const seen = new Set();
  const output = [];
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const item of items) {
    const key = `${item.source}|${item.url || item.title}`.toLowerCase();
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
  return {
    monitorsQueried: results.length,
    monitorsOk: results.filter(result => !result.error).length,
    monitorsFailed: results.filter(result => result.error).length,
    byCategory,
    bySource,
    urgentCount: items.filter(item => item.urgent).length,
    signals: items.filter(item => item.urgent).slice(0, 8).map(item => ({
      severity: 'medium',
      signal: `${item.source}: ${item.title}`,
      category: item.category,
      url: item.url,
    })),
  };
}

async function runMonitor(name, fn) {
  try {
    return { name, status: 'ok', items: await fn() };
  } catch (err) {
    return { name, status: 'error', error: err.message, items: [] };
  }
}

export async function briefing() {
  const results = await Promise.all([
    runMonitor('TreasuryPress', fetchTreasuryPress),
    runMonitor('FederalRegister', fetchFederalRegister),
    runMonitor('EuSanctionsGuidance', fetchEuSanctions),
  ]);
  const items = uniqueRecent(results.flatMap(result => result.items)).slice(0, 80);
  return {
    source: 'OfficialMonitor',
    timestamp: new Date().toISOString(),
    monitors: results.map(result => ({
      name: result.name,
      status: result.status,
      error: result.error || null,
      items: result.items.length,
    })),
    summary: summarize(items, results),
    items,
  };
}

if (process.argv[1]?.endsWith('official-monitor.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
