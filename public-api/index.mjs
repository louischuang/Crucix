import express from 'express';
import { buildOpenApiSpec, swaggerHtml } from './openapi.mjs';
import { initUsageLogDb, isDatabaseConfigured } from './db.mjs';
import { requireApiKeyIfConfigured, usageLogger } from './usage-log.mjs';
import {
  normalizeLang,
  serializeBrief,
  serializeHealth,
  serializeIdeas,
  serializeLanguages,
  serializeLocales,
  serializeNews,
  serializeSources,
} from './serializers.mjs';

function requireData(getState, req, res, next) {
  const state = getState();
  if (!state.currentData) {
    return res.status(503).json({
      error: 'data_not_ready',
      message: 'No data yet. The first Crucix sweep is still in progress.',
    });
  }
  req.publicApiState = state;
  next();
}

export function createPublicApiRouter({ getState }) {
  const router = express.Router();
  const v1 = express.Router();

  initUsageLogDb().catch(err => {
    console.warn('[Public API] usage log init failed:', err.message);
  });

  router.get('/openapi.json', (req, res) => {
    res.json(buildOpenApiSpec());
  });

  router.get('/docs', (req, res) => {
    res.type('html').send(swaggerHtml());
  });

  v1.use(requireApiKeyIfConfigured);
  v1.use(usageLogger);

  v1.get('/health', (req, res) => {
    res.json({
      ...serializeHealth(getState()),
      publicApi: {
        usageLoggingConfigured: isDatabaseConfigured(),
        apiKeyRequired: !!process.env.PUBLIC_API_KEYS,
      },
    });
  });

  v1.get('/brief', (req, res, next) => requireData(getState, req, res, next), (req, res) => {
    res.json(serializeBrief(req.publicApiState.currentData, normalizeLang(req.query.lang)));
  });

  v1.get('/ideas', (req, res, next) => requireData(getState, req, res, next), (req, res) => {
    res.json(serializeIdeas(req.publicApiState.currentData, normalizeLang(req.query.lang)));
  });

  v1.get('/news', (req, res, next) => requireData(getState, req, res, next), (req, res) => {
    res.json(serializeNews(req.publicApiState.currentData, normalizeLang(req.query.lang)));
  });

  v1.get('/sources', (req, res, next) => requireData(getState, req, res, next), (req, res) => {
    res.json(serializeSources(req.publicApiState.currentData));
  });

  v1.get('/locales', (req, res) => {
    res.json(serializeLocales(getState()));
  });

  v1.get('/languages', (req, res) => {
    res.json(serializeLanguages(getState()));
  });

  router.use('/v1', v1);

  router.use((req, res) => {
    res.status(404).json({
      error: 'not_found',
      message: 'Public API endpoint not found.',
    });
  });

  return router;
}
