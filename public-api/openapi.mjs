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
  <style>
    :root{
      color-scheme:dark;
      --bg:#080b0f;
      --panel:#10161d;
      --panel-2:#151d26;
      --line:#2b3847;
      --text:#e8eef6;
      --muted:#a8b4c2;
      --faint:#7e8b9a;
      --accent:#73d2de;
      --green:#6ee7a8;
      --blue:#7ab7ff;
    }
    *{box-sizing:border-box}
    body{margin:0;background:var(--bg);color:var(--text)}
    .swagger-ui{background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .swagger-ui .topbar{display:none}
    .swagger-ui .wrapper{max-width:1320px;padding:24px}
    .swagger-ui .info{margin:22px 0 28px}
    .swagger-ui .info .title,
    .swagger-ui .info h1,
    .swagger-ui .info h2,
    .swagger-ui .info h3,
    .swagger-ui .opblock-tag,
    .swagger-ui .opblock-summary-path,
    .swagger-ui .opblock-summary-description,
    .swagger-ui .model-title,
    .swagger-ui .model,
    .swagger-ui .parameter__name,
    .swagger-ui table thead tr td,
    .swagger-ui table thead tr th,
    .swagger-ui .responses-inner h4,
    .swagger-ui .responses-inner h5{color:var(--text)}
    .swagger-ui .info p,
    .swagger-ui .info li,
    .swagger-ui .renderedMarkdown,
    .swagger-ui .renderedMarkdown p,
    .swagger-ui .renderedMarkdown li,
    .swagger-ui .parameter__type,
    .swagger-ui .parameter__deprecated,
    .swagger-ui .parameter__in,
    .swagger-ui .response-col_status,
    .swagger-ui .response-col_description,
    .swagger-ui .tab li,
    .swagger-ui .scheme-container label,
    .swagger-ui .servers-title,
    .swagger-ui .servers > label{color:var(--muted)}
    .swagger-ui a,
    .swagger-ui .info a{color:var(--accent)}
    .swagger-ui .scheme-container,
    .swagger-ui .opblock,
    .swagger-ui section.models,
    .swagger-ui .model-container,
    .swagger-ui .dialog-ux .modal-ux{background:var(--panel);border:1px solid var(--line);box-shadow:none}
    .swagger-ui .opblock .opblock-summary{border-color:var(--line)}
    .swagger-ui .opblock.opblock-get{background:rgba(122,183,255,.08);border-color:rgba(122,183,255,.48)}
    .swagger-ui .opblock.opblock-get .opblock-summary-method{background:#2563eb;color:white}
    .swagger-ui .opblock .opblock-section-header,
    .swagger-ui .responses-wrapper,
    .swagger-ui .parameters-container,
    .swagger-ui .execute-wrapper{background:var(--panel-2);box-shadow:none;border-color:var(--line)}
    .swagger-ui table tbody tr td{border-top:1px solid var(--line);color:var(--text)}
    .swagger-ui .prop-format,
    .swagger-ui .prop-type,
    .swagger-ui .model .property.primitive{color:var(--green)}
    .swagger-ui .model-toggle:after{filter:invert(1)}
    .swagger-ui select,
    .swagger-ui input,
    .swagger-ui textarea{background:#0c1117!important;color:var(--text)!important;border:1px solid var(--line)!important}
    .swagger-ui input::placeholder,
    .swagger-ui textarea::placeholder{color:var(--faint)}
    .swagger-ui .btn,
    .swagger-ui .btn.authorize,
    .swagger-ui .btn.execute{border-color:var(--line);color:var(--text);box-shadow:none}
    .swagger-ui .btn.execute{background:#0f766e;border-color:#14b8a6;color:white}
    .swagger-ui .btn.authorize{border-color:var(--green);color:var(--green)}
    .swagger-ui .highlight-code,
    .swagger-ui .microlight,
    .swagger-ui pre{background:#05070a!important;color:#d7e2ee!important}
    .swagger-ui .copy-to-clipboard{background:var(--panel-2);border-color:var(--line)}
    .swagger-ui .loading-container .loading:after{color:var(--muted)}
  </style>
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
