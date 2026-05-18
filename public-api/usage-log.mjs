import { createHash, randomUUID } from 'crypto';
import { insertUsageLog } from './db.mjs';

function hashValue(value) {
  if (!value) return null;
  return createHash('sha256').update(String(value)).digest('hex');
}

function getApiKey(req) {
  const headerKey = req.get('x-api-key');
  const auth = req.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;
  return headerKey || bearer || null;
}

function configuredKeys() {
  return (process.env.PUBLIC_API_KEYS || '')
    .split(',')
    .map(key => key.trim())
    .filter(Boolean);
}

export function requireApiKeyIfConfigured(req, res, next) {
  const keys = configuredKeys();
  const provided = getApiKey(req);
  req.publicApiKeyHash = hashValue(provided);

  if (!keys.length) return next();

  const allowed = new Set(keys.map(hashValue));
  if (provided && allowed.has(req.publicApiKeyHash)) return next();

  return res.status(401).json({
    error: 'unauthorized',
    message: 'A valid API key is required for this public API.',
  });
}

export function usageLogger(req, res, next) {
  const started = Date.now();
  req.requestId = req.get('x-request-id') || randomUUID();
  res.setHeader('x-request-id', req.requestId);

  res.on('finish', () => {
    const entry = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
      clientIp: (req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim(),
      userAgent: req.get('user-agent') || '',
      apiKeyHash: req.publicApiKeyHash || null,
      error: res.statusCode >= 400 ? res.statusMessage : null,
    };

    insertUsageLog(entry).catch(err => {
      console.warn('[Public API] usage log insert failed:', err.message);
    });
  });

  next();
}
