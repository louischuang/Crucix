import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { safeFetch } from '../../apis/utils/fetch.mjs';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const YAHOO_CHART_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

function safeTimestamp(ts = new Date().toISOString()) {
  return ts.replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function parseMarkdownTable(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const tableLines = lines
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && line.endsWith('|'));
  if (tableLines.length < 3) return [];

  const headers = tableLines[0]
    .split('|')
    .slice(1, -1)
    .map(cell => cell.trim().toLowerCase());

  return tableLines.slice(2).map(line => {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
    const symbol = row.symbol?.toUpperCase();
    if (!symbol || symbol === '---') return null;
    return {
      symbol,
      name: row.name || symbol,
      category: row.category || 'Watchlist',
      note: row.note || '',
    };
  }).filter(Boolean);
}

export function loadWatchlist(watchlistPath) {
  if (!existsSync(watchlistPath)) return [];
  return parseMarkdownTable(readFileSync(watchlistPath, 'utf8'));
}

export function loadHKStocksSnapshot(runsDir) {
  try {
    const latestPath = join(runsDir, 'hk-stocks', 'latest.json');
    if (!existsSync(latestPath)) return null;
    return JSON.parse(readFileSync(latestPath, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchQuote(watchItem) {
  const symbol = watchItem.symbol;
  const url = `${YAHOO_CHART_BASE}/${encodeURIComponent(symbol)}?range=5d&interval=1d&includePrePost=false`;
  const data = await safeFetch(url, {
    timeout: 8000,
    retries: 1,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });
  if (data?.error) throw new Error(data.error);

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error('empty chart result');

  const meta = result.meta || {};
  const quotes = result.indicators?.quote?.[0] || {};
  const closes = (quotes.close || []).filter(value => value != null);
  const volumes = quotes.volume || [];
  const timestamps = result.timestamp || [];
  const price = meta.regularMarketPrice ?? closes[closes.length - 1];
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? closes[closes.length - 2];
  if (price == null) throw new Error('missing price');

  const change = prevClose != null ? price - prevClose : null;
  const changePct = prevClose ? (change / prevClose) * 100 : null;
  const regularMarketTime = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();
  const latestVolume = meta.regularMarketVolume ?? volumes.filter(value => value != null).at(-1) ?? null;
  const history = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().split('T')[0],
    close: closes[index] == null ? null : Math.round(closes[index] * 1000) / 1000,
  })).filter(item => item.close != null);

  return {
    ...watchItem,
    displayName: watchItem.name || meta.shortName || meta.longName || symbol,
    providerName: meta.shortName || meta.longName || watchItem.name || symbol,
    currency: meta.currency || 'HKD',
    exchange: meta.fullExchangeName || meta.exchangeName || 'HKSE',
    marketState: meta.marketState || 'UNKNOWN',
    price: Math.round(price * 1000) / 1000,
    prevClose: prevClose == null ? null : Math.round(prevClose * 1000) / 1000,
    change: change == null ? null : Math.round(change * 1000) / 1000,
    changePct: changePct == null ? null : Math.round(changePct * 100) / 100,
    volume: latestVolume,
    timestamp: regularMarketTime,
    status: 'live',
    history,
  };
}

function staleFromPrevious(watchItem, previous, error) {
  const prior = (previous?.items || []).find(item => item.symbol === watchItem.symbol);
  if (prior) {
    return {
      ...prior,
      ...watchItem,
      displayName: watchItem.name || prior.displayName || prior.name || watchItem.symbol,
      status: 'stale',
      error,
      staleAt: new Date().toISOString(),
    };
  }
  return {
    ...watchItem,
    displayName: watchItem.name || watchItem.symbol,
    currency: 'HKD',
    price: null,
    change: null,
    changePct: null,
    volume: null,
    timestamp: null,
    status: 'missing',
    error,
  };
}

function persistSnapshot(runsDir, snapshot) {
  const dir = join(runsDir, 'hk-stocks');
  ensureDir(dir);
  writeFileSync(join(dir, 'latest.json'), JSON.stringify(snapshot, null, 2));
  writeFileSync(join(dir, `${safeTimestamp(snapshot.updatedAt)}.json`), JSON.stringify(snapshot, null, 2));
}

export async function collectHKStocks({ rootDir, runsDir, previous = null, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const watchlistPath = process.env.HK_STOCKS_WATCHLIST_PATH || join(rootDir, 'config', 'hk-stocks.md');
  const watchlist = loadWatchlist(watchlistPath);
  const source = process.env.HK_STOCKS_PROVIDER || 'yahoo-chart';
  const startedAt = Date.now();

  const settled = await Promise.allSettled(watchlist.map(item => fetchQuote(item)));
  const items = settled.map((result, index) => {
    const watchItem = watchlist[index];
    if (result.status === 'fulfilled') return result.value;
    return staleFromPrevious(watchItem, previous, result.reason?.message || 'quote fetch failed');
  });
  const ok = items.filter(item => item.status === 'live').length;
  const stale = items.filter(item => item.status === 'stale').length;
  const missing = items.filter(item => item.status === 'missing').length;

  const snapshot = {
    updatedAt: new Date().toISOString(),
    source,
    watchlistPath,
    intervalSeconds: Math.round(intervalMs / 1000),
    durationMs: Date.now() - startedAt,
    items,
    health: {
      total: watchlist.length,
      ok,
      failed: stale + missing,
      stale,
      missing,
    },
  };
  persistSnapshot(runsDir, snapshot);
  return snapshot;
}
