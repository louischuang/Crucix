export function buildOpenApiSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Crucix Public API',
      version: '1.0.0',
      description: 'Stable third-party API for Crucix intelligence summaries, ideas, news, and source status.',
    },
    servers: [
      { url: '/public-api/v1', description: 'Current Crucix instance' },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description: 'Optional. Required only when PUBLIC_API_KEYS is configured.',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Optional alternative to x-api-key.',
        },
      },
      parameters: {
        Lang: {
          name: 'lang',
          in: 'query',
          schema: { type: 'string', enum: ['en', 'zh'], default: 'en' },
          description: 'Response language. zh returns Traditional Chinese when LLM translations are available.',
        },
      },
    },
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }, {}],
    paths: {
      '/health': {
        get: {
          summary: 'Public API health',
          responses: {
            200: { description: 'Service health and sweep state' },
          },
        },
      },
      '/brief': {
        get: {
          summary: 'AI brief',
          parameters: [{ $ref: '#/components/parameters/Lang' }],
          responses: {
            200: { description: 'Current AI brief' },
            503: { description: 'Dashboard data is not ready yet' },
          },
        },
      },
      '/ideas': {
        get: {
          summary: 'Leverageable ideas',
          parameters: [{ $ref: '#/components/parameters/Lang' }],
          responses: {
            200: { description: 'Current LLM ideas' },
            503: { description: 'Dashboard data is not ready yet' },
          },
        },
      },
      '/news': {
        get: {
          summary: 'News feed',
          parameters: [{ $ref: '#/components/parameters/Lang' }],
          responses: {
            200: { description: 'Current public news feed' },
            503: { description: 'Dashboard data is not ready yet' },
          },
        },
      },
      '/sources': {
        get: {
          summary: 'Source status and public source summaries',
          responses: {
            200: { description: 'Current source summary' },
            503: { description: 'Dashboard data is not ready yet' },
          },
        },
      },
      '/locales': {
        get: {
          summary: 'Supported locales',
          responses: {
            200: { description: 'Locale metadata' },
          },
        },
      },
    },
  };
}

export function swaggerHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Crucix Public API Docs</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body{margin:0;background:#0b0d10}.swagger-ui .topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/public-api/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      persistAuthorization: true
    });
  </script>
</body>
</html>`;
}
